# HashTac

## Edge Cases Handled

| Scenario | Outcome |
|---|---|
| Both players reveal the same empty cell | Conflict - no mark placed for that cell |
| A player reveals an occupied cell | Invalid reveal - that player forfeits the match |
| Both players form a winning line in the same round | Draw |
| Board fills without a winner | Draw |
| One player forfeits | Opponent wins |

## Smart Contract API

### Commands

| Method | Description |
|---|---|
| `CreateLobby()` | Create an open lobby |
| `JoinLobby(lobby_id)` | Join a lobby and start a match |
| `CancelLobby(lobby_id)` | Cancel an open lobby (host only) |
| `CommitMove(match_id, round, hash)` | Submit a move commitment |
| `RevealMove(match_id, round, cell, salt)` | Reveal a committed move |
| `SettleRound(match_id)` | Settle the current round |
| `ForfeitMatch(match_id)` | Forfeit an active match |

### Queries

| Method | Returns |
|---|---|
| `OpenLobbies()` | List of open lobbies |
| `MatchById(match_id)` | Full match state |
| `ActiveMatch(player)` | Active match for a player, if any |
| `Leaderboard(limit)` | Top players sorted by wins |
| `PlayerStats(player)` | Stats for a specific player |
| `Version()` | Contract version |

### Events

`LobbyCreated`, `LobbyJoined`, `LobbyCancelled`, `MoveCommitted`, `MoveRevealed`, `RoundSettled`, `MatchFinished`, `LeaderboardUpdated`