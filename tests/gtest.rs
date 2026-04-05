use sails_rs::{client::*, gtest::*, prelude::*, scale_codec::Encode};
use sha2::{Digest, Sha256};
use tic_tac_toe_sails_client::{
    CommitInput, MatchResultKind, MatchView, RevealInput, TicTacToeSailsClient,
    TicTacToeSailsClientCtors, game::Game,
};

const HOST: u64 = sails_rs::gtest::constants::DEFAULT_USER_ALICE;
const GUEST: u64 = sails_rs::gtest::constants::DEFAULT_USER_BOB;
const INITIAL_BALANCE: u128 = sails_rs::gtest::constants::EXISTENTIAL_DEPOSIT * 1_000;

#[derive(Encode)]
#[codec(crate = sails_rs::scale_codec)]
struct CommitmentPayload {
    match_id: u64,
    round: u8,
    player: ActorId,
    cell: u8,
    salt: [u8; 32],
}

fn move_hash(match_id: u64, round: u8, player: u64, cell: u8, salt_byte: u8) -> [u8; 32] {
    let payload = CommitmentPayload {
        match_id,
        round,
        player: player.into(),
        cell,
        salt: [salt_byte; 32],
    };
    let mut hasher = Sha256::new();
    hasher.update(payload.encode());
    hasher.finalize().into()
}

fn reveal_input(cell: u8, salt_byte: u8) -> RevealInput {
    RevealInput {
        cell,
        salt: [salt_byte; 32],
    }
}

async fn deploy_program() -> (
    GtestEnv,
    sails_rs::client::Actor<
        tic_tac_toe_sails_client::TicTacToeSailsClientProgram,
        sails_rs::client::GtestEnv,
    >,
) {
    let system = System::new();
    system.init_logger_with_default_filter("gwasm=debug,gtest=info,sails_rs=debug");
    system.mint_to(HOST, INITIAL_BALANCE);
    system.mint_to(GUEST, INITIAL_BALANCE);

    let code_id = system.submit_code(tic_tac_toe_sails::WASM_BINARY);
    let env = GtestEnv::new(system, HOST.into());
    let program = env
        .deploy::<tic_tac_toe_sails_client::TicTacToeSailsClientProgram>(code_id, b"salt".to_vec())
        .create()
        .await
        .unwrap();

    (env, program)
}

async fn open_match(
    env: &GtestEnv,
    program: &sails_rs::client::Actor<
        tic_tac_toe_sails_client::TicTacToeSailsClientProgram,
        sails_rs::client::GtestEnv,
    >,
) -> MatchView {
    let mut host_game = program.game();
    let lobby = host_game.create_lobby().await.unwrap().unwrap();

    let guest_program = sails_rs::client::Actor::<
        tic_tac_toe_sails_client::TicTacToeSailsClientProgram,
        sails_rs::client::GtestEnv,
    >::new(env.clone().with_actor_id(GUEST.into()), program.id());
    let mut guest_game = guest_program.game();
    guest_game.join_lobby(lobby.id).await.unwrap().unwrap()
}

async fn play_round(
    env: &GtestEnv,
    program: &sails_rs::client::Actor<
        tic_tac_toe_sails_client::TicTacToeSailsClientProgram,
        sails_rs::client::GtestEnv,
    >,
    match_id: u64,
    round: u8,
    host_cell: u8,
    host_salt: u8,
    guest_cell: u8,
    guest_salt: u8,
) -> MatchView {
    let mut host_game = program.game();
    let guest_program = sails_rs::client::Actor::<
        tic_tac_toe_sails_client::TicTacToeSailsClientProgram,
        sails_rs::client::GtestEnv,
    >::new(env.clone().with_actor_id(GUEST.into()), program.id());
    let mut guest_game = guest_program.game();

    host_game
        .commit_move(
            match_id,
            round,
            CommitInput {
                hash: move_hash(match_id, round, HOST, host_cell, host_salt),
            },
        )
        .await
        .unwrap()
        .unwrap();
    guest_game
        .commit_move(
            match_id,
            round,
            CommitInput {
                hash: move_hash(match_id, round, GUEST, guest_cell, guest_salt),
            },
        )
        .await
        .unwrap()
        .unwrap();

    host_game
        .reveal_move(match_id, round, reveal_input(host_cell, host_salt))
        .await
        .unwrap()
        .unwrap();
    guest_game
        .reveal_move(match_id, round, reveal_input(guest_cell, guest_salt))
        .await
        .unwrap()
        .unwrap();

    host_game.settle_round(match_id).await.unwrap().unwrap()
}

#[tokio::test]
async fn lobby_flow_exposes_active_match() {
    let (env, program) = deploy_program().await;

    let match_view = open_match(&env, &program).await;
    assert_eq!(match_view.host, HOST.into());
    assert_eq!(match_view.guest, GUEST.into());
    assert_eq!(match_view.next_round, 1);
    assert!(match_view.outcome.is_none());

    let host_game = program.game();
    let active = host_game.active_match(HOST.into()).await.unwrap().unwrap();
    assert_eq!(active.id, match_view.id);
    assert!(host_game.open_lobbies().await.unwrap().is_empty());
}

#[tokio::test]
async fn host_can_win_and_leaderboard_updates() {
    let (env, program) = deploy_program().await;
    let match_view = open_match(&env, &program).await;

    let match_view = play_round(&env, &program, match_view.id, 1, 0, 1, 3, 11).await;
    assert!(match_view.outcome.is_none());
    let match_view = play_round(&env, &program, match_view.id, 2, 1, 2, 4, 12).await;
    assert!(match_view.outcome.is_none());
    let match_view = play_round(&env, &program, match_view.id, 3, 2, 3, 8, 13).await;

    let outcome = match_view.outcome.expect("round three should finish the match");
    assert_eq!(outcome.result, MatchResultKind::HostWon);
    assert_eq!(outcome.winner, Some(HOST.into()));

    let leaderboard = program.game().leaderboard(10).await.unwrap();
    assert_eq!(leaderboard.len(), 2);

    let host_stats = program.game().player_stats(HOST.into()).await.unwrap();
    let guest_stats = program.game().player_stats(GUEST.into()).await.unwrap();
    assert_eq!(host_stats.wins, 1);
    assert_eq!(host_stats.matches_played, 1);
    assert_eq!(guest_stats.losses, 1);
    assert_eq!(guest_stats.matches_played, 1);
}

#[tokio::test]
async fn occupied_reveal_cell_causes_loss() {
    let (env, program) = deploy_program().await;
    let match_view = open_match(&env, &program).await;

    let match_view = play_round(&env, &program, match_view.id, 1, 0, 21, 3, 31).await;
    assert!(match_view.outcome.is_none());

    let match_view = play_round(&env, &program, match_view.id, 2, 1, 22, 0, 32).await;
    let outcome = match_view.outcome.expect("occupied cell should finish the match");
    assert_eq!(outcome.result, MatchResultKind::HostWon);
    assert_eq!(outcome.winner, Some(HOST.into()));
}

#[tokio::test]
async fn simultaneous_lines_settle_as_draw() {
    let (env, program) = deploy_program().await;
    let match_view = open_match(&env, &program).await;

    let match_view = play_round(&env, &program, match_view.id, 1, 0, 41, 3, 51).await;
    assert!(match_view.outcome.is_none());
    let match_view = play_round(&env, &program, match_view.id, 2, 1, 42, 4, 52).await;
    assert!(match_view.outcome.is_none());
    let match_view = play_round(&env, &program, match_view.id, 3, 2, 43, 5, 53).await;

    let outcome = match_view.outcome.expect("simultaneous lines should end the match");
    assert_eq!(outcome.result, MatchResultKind::Draw);

    let host_stats = program.game().player_stats(HOST.into()).await.unwrap();
    let guest_stats = program.game().player_stats(GUEST.into()).await.unwrap();
    assert_eq!(host_stats.draws, 1);
    assert_eq!(guest_stats.draws, 1);
}
