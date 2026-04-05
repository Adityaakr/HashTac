#![no_std]

use sails_rs::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    gstd::msg,
    prelude::*,
};
use sha2::{Digest, Sha256};

type HashBytes = [u8; 32];

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct State {
    next_lobby_id: u64,
    next_match_id: u64,
    lobbies: BTreeMap<u64, Lobby>,
    open_lobby_by_host: BTreeMap<ActorId, u64>,
    matches: BTreeMap<u64, MatchRecord>,
    active_match_by_player: BTreeMap<ActorId, u64>,
    leaderboard: BTreeMap<ActorId, PlayerStats>,
    leaderboard_finalized_matches: BTreeSet<u64>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct Lobby {
    pub id: u64,
    pub host: ActorId,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct PlayerStats {
    pub matches_played: u32,
    pub wins: u32,
    pub losses: u32,
    pub draws: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct LeaderboardEntry {
    pub player: ActorId,
    pub stats: PlayerStats,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum Mark {
    #[default]
    Empty,
    X,
    O,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PlayerRole {
    Host,
    Guest,
}

impl PlayerRole {
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum MatchLifecycle {
    #[default]
    Active,
    Finished,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum MatchResultKind {
    HostWon,
    GuestWon,
    #[default]
    Draw,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum MatchEndReason {
    LineCompleted,
    #[default]
    BoardFull,
    SimultaneousWin,
    InvalidCell,
    Forfeit,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MatchOutcome {
    pub result: MatchResultKind,
    pub reason: MatchEndReason,
    pub winner: Option<ActorId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct RoundView {
    pub round: u8,
    pub host_committed: bool,
    pub guest_committed: bool,
    pub host_revealed: bool,
    pub guest_revealed: bool,
    pub settled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct MatchView {
    pub id: u64,
    pub host: ActorId,
    pub guest: ActorId,
    pub board: [Mark; 9],
    pub lifecycle: MatchLifecycle,
    pub next_round: u8,
    pub round: RoundView,
    pub outcome: Option<MatchOutcome>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct CommitInput {
    pub hash: HashBytes,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct RevealInput {
    pub cell: u8,
    pub salt: HashBytes,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub struct RevealMove {
    pub cell: u8,
    pub salt: HashBytes,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
struct CommitmentPayload {
    match_id: u64,
    round: u8,
    player: ActorId,
    cell: u8,
    salt: HashBytes,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum GameError {
    AlreadyInActiveMatch,
    AlreadyHostingLobby,
    LobbyNotFound,
    CannotJoinOwnLobby,
    MatchNotFound,
    NotMatchParticipant,
    InvalidRound,
    RoundAlreadySettled,
    CommitmentAlreadySubmitted,
    RevealAlreadySubmitted,
    CommitmentMissing,
    RevealMissing,
    InvalidRevealHash,
    MatchAlreadyFinished,
    CellOutOfBounds,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct RoundRecord {
    commits: BTreeMap<ActorId, HashBytes>,
    reveals: BTreeMap<ActorId, RevealMove>,
    settled: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct MatchRecord {
    id: u64,
    host: ActorId,
    guest: ActorId,
    board: [Mark; 9],
    next_round: u8,
    round: RoundRecord,
    outcome: Option<MatchOutcome>,
}

impl MatchRecord {
    fn new(id: u64, host: ActorId, guest: ActorId) -> Self {
        Self {
            id,
            host,
            guest,
            board: [Mark::Empty; 9],
            next_round: 1,
            round: RoundRecord::default(),
            outcome: None,
        }
    }

    fn lifecycle(&self) -> MatchLifecycle {
        if self.outcome.is_some() {
            MatchLifecycle::Finished
        } else {
            MatchLifecycle::Active
        }
    }
}

impl Default for RoundRecord {
    fn default() -> Self {
        Self {
            commits: BTreeMap::new(),
            reveals: BTreeMap::new(),
            settled: false,
        }
    }
}

#[sails_rs::event]
#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TypeInfo)]
#[codec(crate = sails_rs::scale_codec)]
#[scale_info(crate = sails_rs::scale_info)]
pub enum TicTacToeEvent {
    LobbyCreated { lobby_id: u64, host: ActorId },
    LobbyJoined {
        lobby_id: u64,
        match_id: u64,
        host: ActorId,
        guest: ActorId,
    },
    LobbyCancelled { lobby_id: u64, host: ActorId },
    MoveCommitted {
        match_id: u64,
        round: u8,
        player: ActorId,
    },
    MoveRevealed {
        match_id: u64,
        round: u8,
        player: ActorId,
    },
    RoundSettled {
        match_id: u64,
        round: u8,
        board: [Mark; 9],
        outcome: Option<MatchOutcome>,
    },
    MatchFinished {
        match_id: u64,
        outcome: MatchOutcome,
    },
    LeaderboardUpdated {
        player: ActorId,
        stats: PlayerStats,
    },
}

struct TicTacToeService<'a> {
    state: &'a RefCell<State>,
}

impl<'a> TicTacToeService<'a> {
    fn new(state: &'a RefCell<State>) -> Self {
        Self { state }
    }
}

#[sails_rs::service(events = TicTacToeEvent)]
impl TicTacToeService<'_> {
    #[export]
    pub fn version(&self) -> u32 {
        1
    }

    #[export]
    pub fn open_lobbies(&self) -> Vec<Lobby> {
        self.state.borrow().lobbies.values().cloned().collect()
    }

    #[export]
    pub fn leaderboard(&self, limit: u16) -> Vec<LeaderboardEntry> {
        let mut entries: Vec<_> = self
            .state
            .borrow()
            .leaderboard
            .iter()
            .map(|(player, stats)| LeaderboardEntry {
                player: *player,
                stats: stats.clone(),
            })
            .collect();
        entries.sort_by(|left, right| {
            right
                .stats
                .wins
                .cmp(&left.stats.wins)
                .then(right.stats.draws.cmp(&left.stats.draws))
                .then(left.stats.losses.cmp(&right.stats.losses))
                .then(right.stats.matches_played.cmp(&left.stats.matches_played))
        });
        if limit == 0 || usize::from(limit) >= entries.len() {
            entries
        } else {
            entries.into_iter().take(limit as usize).collect()
        }
    }

    #[export]
    pub fn player_stats(&self, player: ActorId) -> PlayerStats {
        self.state
            .borrow()
            .leaderboard
            .get(&player)
            .cloned()
            .unwrap_or_default()
    }

    #[export]
    pub fn active_match(&self, player: ActorId) -> Option<MatchView> {
        let state = self.state.borrow();
        let match_id = state.active_match_by_player.get(&player)?;
        state.matches.get(match_id).map(Self::match_view)
    }

    #[export]
    pub fn match_by_id(&self, match_id: u64) -> Result<MatchView, GameError> {
        let state = self.state.borrow();
        let record = state.matches.get(&match_id).ok_or(GameError::MatchNotFound)?;
        Ok(Self::match_view(record))
    }

    #[export]
    pub fn create_lobby(&mut self) -> Result<Lobby, GameError> {
        let caller = msg::source();
        let (lobby, event) = {
            let mut state = self.state.borrow_mut();
            Self::ensure_can_open_lobby(&state, caller)?;
            state.next_lobby_id += 1;
            let lobby = Lobby {
                id: state.next_lobby_id,
                host: caller,
            };
            state.open_lobby_by_host.insert(caller, lobby.id);
            state.lobbies.insert(lobby.id, lobby.clone());
            let event = TicTacToeEvent::LobbyCreated {
                lobby_id: lobby.id,
                host: caller,
            };
            (lobby, event)
        };
        self.emit_event(event).expect("event must be emitted");
        Ok(lobby)
    }

    #[export]
    pub fn join_lobby(&mut self, lobby_id: u64) -> Result<MatchView, GameError> {
        let caller = msg::source();
        let (match_view, event) = {
            let mut state = self.state.borrow_mut();
            Self::ensure_can_open_lobby(&state, caller)?;
            let lobby = state.lobbies.remove(&lobby_id).ok_or(GameError::LobbyNotFound)?;
            state.open_lobby_by_host.remove(&lobby.host);
            if lobby.host == caller {
                return Err(GameError::CannotJoinOwnLobby);
            }

            state.next_match_id += 1;
            let record = MatchRecord::new(state.next_match_id, lobby.host, caller);
            let match_view = Self::match_view(&record);
            let event = TicTacToeEvent::LobbyJoined {
                lobby_id,
                match_id: record.id,
                host: lobby.host,
                guest: caller,
            };
            state.active_match_by_player.insert(lobby.host, record.id);
            state.active_match_by_player.insert(caller, record.id);
            state.matches.insert(record.id, record);
            (match_view, event)
        };
        self.emit_event(event).expect("event must be emitted");
        Ok(match_view)
    }

    #[export]
    pub fn cancel_lobby(&mut self, lobby_id: u64) -> Result<(), GameError> {
        let caller = msg::source();
        let event = {
            let mut state = self.state.borrow_mut();
            let lobby = state.lobbies.get(&lobby_id).ok_or(GameError::LobbyNotFound)?;
            if lobby.host != caller {
                return Err(GameError::CannotJoinOwnLobby);
            }
            state.lobbies.remove(&lobby_id);
            state.open_lobby_by_host.remove(&caller);
            TicTacToeEvent::LobbyCancelled {
                lobby_id,
                host: caller,
            }
        };
        self.emit_event(event).expect("event must be emitted");
        Ok(())
    }

    #[export]
    pub fn commit_move(
        &mut self,
        match_id: u64,
        round: u8,
        input: CommitInput,
    ) -> Result<MatchView, GameError> {
        let caller = msg::source();
        let (view, event) = {
            let mut state = self.state.borrow_mut();
            let record = state
                .matches
                .get_mut(&match_id)
                .ok_or(GameError::MatchNotFound)?;
            Self::ensure_active_match(record)?;
            Self::ensure_role(record, caller)?;
            if round != record.next_round {
                return Err(GameError::InvalidRound);
            }
            if record.round.settled {
                return Err(GameError::RoundAlreadySettled);
            }
            if record.round.commits.contains_key(&caller) {
                return Err(GameError::CommitmentAlreadySubmitted);
            }
            record.round.commits.insert(caller, input.hash);
            let view = Self::match_view(record);
            let event = TicTacToeEvent::MoveCommitted {
                match_id,
                round,
                player: caller,
            };
            (view, event)
        };
        self.emit_event(event).expect("event must be emitted");
        Ok(view)
    }

    #[export]
    pub fn reveal_move(
        &mut self,
        match_id: u64,
        round: u8,
        input: RevealInput,
    ) -> Result<MatchView, GameError> {
        let caller = msg::source();
        let (view, event) = {
            let mut state = self.state.borrow_mut();
            let record = state
                .matches
                .get_mut(&match_id)
                .ok_or(GameError::MatchNotFound)?;
            Self::ensure_active_match(record)?;
            Self::ensure_role(record, caller)?;
            if round != record.next_round {
                return Err(GameError::InvalidRound);
            }
            if record.round.settled {
                return Err(GameError::RoundAlreadySettled);
            }
            if input.cell > 8 {
                return Err(GameError::CellOutOfBounds);
            }
            let expected_commit = *record
                .round
                .commits
                .get(&caller)
                .ok_or(GameError::CommitmentMissing)?;
            if record.round.reveals.contains_key(&caller) {
                return Err(GameError::RevealAlreadySubmitted);
            }

            let reveal = RevealMove {
                cell: input.cell,
                salt: input.salt,
            };
            if Self::commitment_hash(match_id, round, caller, &reveal) != expected_commit {
                return Err(GameError::InvalidRevealHash);
            }

            record.round.reveals.insert(caller, reveal);
            let view = Self::match_view(record);
            let event = TicTacToeEvent::MoveRevealed {
                match_id,
                round,
                player: caller,
            };
            (view, event)
        };
        self.emit_event(event).expect("event must be emitted");
        Ok(view)
    }

    #[export]
    pub fn settle_round(&mut self, match_id: u64) -> Result<MatchView, GameError> {
        let caller = msg::source();
        let (view, settle_event, finish_event, leaderboard_events) = {
            let mut state = self.state.borrow_mut();
            let (
                host,
                guest,
                round_number,
                board,
                maybe_outcome,
                view,
                settle_event,
                finish_event,
            ) = {
                let record = state
                    .matches
                    .get_mut(&match_id)
                    .ok_or(GameError::MatchNotFound)?;
                Self::ensure_active_match(record)?;
                Self::ensure_role(record, caller)?;
                if record.round.settled {
                    return Err(GameError::RoundAlreadySettled);
                }

                let host_reveal = record
                    .round
                    .reveals
                    .get(&record.host)
                    .cloned()
                    .ok_or(GameError::RevealMissing)?;
                let guest_reveal = record
                    .round
                    .reveals
                    .get(&record.guest)
                    .cloned()
                    .ok_or(GameError::RevealMissing)?;

                let invalid_host = record.board[host_reveal.cell as usize] != Mark::Empty;
                let invalid_guest = record.board[guest_reveal.cell as usize] != Mark::Empty;

                let round_number = record.next_round;
                let outcome = if invalid_host && invalid_guest {
                    Some(Self::draw_outcome(MatchEndReason::InvalidCell))
                } else if invalid_host {
                    Some(Self::guest_wins(record.guest, MatchEndReason::InvalidCell))
                } else if invalid_guest {
                    Some(Self::host_wins(record.host, MatchEndReason::InvalidCell))
                } else {
                    if host_reveal.cell != guest_reveal.cell {
                        record.board[host_reveal.cell as usize] = Mark::X;
                        record.board[guest_reveal.cell as usize] = Mark::O;
                    }
                    Self::evaluate_board(record)
                };

                record.round.settled = true;
                if let Some(final_outcome) = outcome.clone() {
                    record.outcome = Some(final_outcome.clone());
                    let view = Self::match_view(record);
                    let settle_event = TicTacToeEvent::RoundSettled {
                        match_id: record.id,
                        round: round_number,
                        board: record.board,
                        outcome: Some(final_outcome.clone()),
                    };
                    let finish_event = Some(TicTacToeEvent::MatchFinished {
                        match_id: record.id,
                        outcome: final_outcome,
                    });
                    (
                        record.host,
                        record.guest,
                        round_number,
                        record.board,
                        outcome,
                        view,
                        settle_event,
                        finish_event,
                    )
                } else {
                    record.next_round += 1;
                    record.round = RoundRecord::default();
                    let view = Self::match_view(record);
                    let settle_event = TicTacToeEvent::RoundSettled {
                        match_id: record.id,
                        round: round_number,
                        board: record.board,
                        outcome: None,
                    };
                    (
                        record.host,
                        record.guest,
                        round_number,
                        record.board,
                        None,
                        view,
                        settle_event,
                        None,
                    )
                }
            };

            if let Some(final_outcome) = maybe_outcome {
                state.active_match_by_player.remove(&host);
                state.active_match_by_player.remove(&guest);
                let leaderboard_events =
                    Self::update_leaderboard(&mut state, match_id, host, guest, &final_outcome);
                let _ = (round_number, board);
                (view, settle_event, finish_event, leaderboard_events)
            } else {
                (view, settle_event, finish_event, Vec::new())
            }
        };

        self.emit_event(settle_event).expect("event must be emitted");
        if let Some(event) = finish_event {
            self.emit_event(event).expect("event must be emitted");
        }
        for event in leaderboard_events {
            self.emit_event(event).expect("event must be emitted");
        }
        Ok(view)
    }

    #[export]
    pub fn forfeit_match(&mut self, match_id: u64) -> Result<MatchView, GameError> {
        let caller = msg::source();
        let (view, settle_event, finish_event, leaderboard_events) = {
            let mut state = self.state.borrow_mut();
            let (host, guest, round, board, outcome, view) = {
                let record = state
                    .matches
                    .get_mut(&match_id)
                    .ok_or(GameError::MatchNotFound)?;
                Self::ensure_active_match(record)?;
                let role = Self::ensure_role(record, caller)?;
                let outcome = match role {
                    PlayerRole::Host => Self::guest_wins(record.guest, MatchEndReason::Forfeit),
                    PlayerRole::Guest => Self::host_wins(record.host, MatchEndReason::Forfeit),
                };

                record.round.settled = true;
                record.outcome = Some(outcome.clone());
                let view = Self::match_view(record);
                (
                    record.host,
                    record.guest,
                    record.next_round,
                    record.board,
                    outcome,
                    view,
                )
            };
            state.active_match_by_player.remove(&host);
            state.active_match_by_player.remove(&guest);
            let leaderboard_events =
                Self::update_leaderboard(&mut state, match_id, host, guest, &outcome);
            let settle_event = TicTacToeEvent::RoundSettled {
                match_id,
                round,
                board,
                outcome: Some(outcome.clone()),
            };
            let finish_event = TicTacToeEvent::MatchFinished { match_id, outcome };
            (view, settle_event, finish_event, leaderboard_events)
        };

        self.emit_event(settle_event).expect("event must be emitted");
        self.emit_event(finish_event).expect("event must be emitted");
        for event in leaderboard_events {
            self.emit_event(event).expect("event must be emitted");
        }
        Ok(view)
    }

    fn ensure_can_open_lobby(state: &State, caller: ActorId) -> Result<(), GameError> {
        if state.active_match_by_player.contains_key(&caller) {
            return Err(GameError::AlreadyInActiveMatch);
        }
        if state.open_lobby_by_host.contains_key(&caller) {
            return Err(GameError::AlreadyHostingLobby);
        }
        Ok(())
    }

    fn ensure_active_match(record: &MatchRecord) -> Result<(), GameError> {
        if record.outcome.is_some() {
            Err(GameError::MatchAlreadyFinished)
        } else {
            Ok(())
        }
    }

    fn ensure_role(record: &MatchRecord, caller: ActorId) -> Result<PlayerRole, GameError> {
        if record.host == caller {
            Ok(PlayerRole::Host)
        } else if record.guest == caller {
            Ok(PlayerRole::Guest)
        } else {
            Err(GameError::NotMatchParticipant)
        }
    }

    fn commitment_hash(match_id: u64, round: u8, player: ActorId, reveal: &RevealMove) -> HashBytes {
        let payload = CommitmentPayload {
            match_id,
            round,
            player,
            cell: reveal.cell,
            salt: reveal.salt,
        };
        let encoded = payload.encode();
        let mut hasher = Sha256::new();
        hasher.update(encoded);
        hasher.finalize().into()
    }

    fn evaluate_board(record: &MatchRecord) -> Option<MatchOutcome> {
        let host_has_line = Self::has_line(&record.board, Mark::X);
        let guest_has_line = Self::has_line(&record.board, Mark::O);

        if host_has_line && guest_has_line {
            Some(Self::draw_outcome(MatchEndReason::SimultaneousWin))
        } else if host_has_line {
            Some(Self::host_wins(record.host, MatchEndReason::LineCompleted))
        } else if guest_has_line {
            Some(Self::guest_wins(record.guest, MatchEndReason::LineCompleted))
        } else if record.board.iter().all(|cell| *cell != Mark::Empty) {
            Some(Self::draw_outcome(MatchEndReason::BoardFull))
        } else {
            None
        }
    }

    fn has_line(board: &[Mark; 9], mark: Mark) -> bool {
        const LINES: [[usize; 3]; 8] = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];

        LINES.iter().any(|line| {
            board[line[0]] == mark && board[line[1]] == mark && board[line[2]] == mark
        })
    }

    fn host_wins(host: ActorId, reason: MatchEndReason) -> MatchOutcome {
        MatchOutcome {
            result: MatchResultKind::HostWon,
            reason,
            winner: Some(host),
        }
    }

    fn guest_wins(guest: ActorId, reason: MatchEndReason) -> MatchOutcome {
        MatchOutcome {
            result: MatchResultKind::GuestWon,
            reason,
            winner: Some(guest),
        }
    }

    fn draw_outcome(reason: MatchEndReason) -> MatchOutcome {
        MatchOutcome {
            result: MatchResultKind::Draw,
            reason,
            winner: None,
        }
    }

    fn update_leaderboard(
        state: &mut State,
        match_id: u64,
        host: ActorId,
        guest: ActorId,
        outcome: &MatchOutcome,
    ) -> Vec<TicTacToeEvent> {
        if !state.leaderboard_finalized_matches.insert(match_id) {
            return Vec::new();
        }

        let mut events = Vec::new();
        let mut host_stats = state.leaderboard.get(&host).cloned().unwrap_or_default();
        let mut guest_stats = state.leaderboard.get(&guest).cloned().unwrap_or_default();
        host_stats.matches_played += 1;
        guest_stats.matches_played += 1;

        match outcome.result {
            MatchResultKind::HostWon => {
                host_stats.wins += 1;
                guest_stats.losses += 1;
            }
            MatchResultKind::GuestWon => {
                guest_stats.wins += 1;
                host_stats.losses += 1;
            }
            MatchResultKind::Draw => {
                host_stats.draws += 1;
                guest_stats.draws += 1;
            }
        }

        state.leaderboard.insert(host, host_stats.clone());
        state.leaderboard.insert(guest, guest_stats.clone());

        events.push(TicTacToeEvent::LeaderboardUpdated {
            player: host,
            stats: host_stats,
        });
        events.push(TicTacToeEvent::LeaderboardUpdated {
            player: guest,
            stats: guest_stats,
        });
        events
    }

    fn match_view(record: &MatchRecord) -> MatchView {
        MatchView {
            id: record.id,
            host: record.host,
            guest: record.guest,
            board: record.board,
            lifecycle: record.lifecycle(),
            next_round: record.next_round,
            round: RoundView {
                round: record.next_round,
                host_committed: record.round.commits.contains_key(&record.host),
                guest_committed: record.round.commits.contains_key(&record.guest),
                host_revealed: record.round.reveals.contains_key(&record.host),
                guest_revealed: record.round.reveals.contains_key(&record.guest),
                settled: record.round.settled,
            },
            outcome: record.outcome.clone(),
        }
    }
}

#[derive(Default)]
pub struct Program {
    state: RefCell<State>,
}

#[sails_rs::program]
impl Program {
    pub fn create() -> Self {
        let mut state = State::default();
        state.next_lobby_id = 0;
        state.next_match_id = 0;
        Self {
            state: RefCell::new(state),
        }
    }

    pub fn game(&self) -> TicTacToeService<'_> {
        TicTacToeService::new(&self.state)
    }
}
