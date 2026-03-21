"""
export_event_log.py — Converts moves_log.csv + games_log.csv into a pm4py-compatible event log.
See PLAN.md, Phase 1.5 / Phase 5.

Usage:
    python export_event_log.py                      # writes logs/event_log_pm4py.csv
    python export_event_log.py --output my_log.csv  # custom output path
"""

import argparse
import csv
import os

LOGS_DIR = os.path.join(os.path.dirname(__file__), 'logs')
MOVES_LOG = os.path.join(LOGS_DIR, 'moves_log.csv')
GAMES_LOG = os.path.join(LOGS_DIR, 'games_log.csv')
DEFAULT_OUTPUT = os.path.join(LOGS_DIR, 'event_log_pm4py.csv')

# pm4py standard column names
PM4PY_HEADERS = [
    'case:concept:name',       # Case ID (game_id)
    'concept:name',            # Activity (move_san)
    'time:timestamp',          # Timestamp
    'org:resource',            # Resource (user / engine)
    'move_number',
    'move_uci',
    'fen_before',
    'fen_after',
    'eval_before',
    'eval_after',
    'elo_setting',
    'time_remaining',
    'game_mode',
    'case:result',             # Case-level attribute
    'case:elo_setting',
    'case:player_color',
    'case:game_mode',
    'case:player_age',
    'case:player2_age',
]


def load_games_index():
    """Load games_log.csv into a dict keyed by game_id."""
    games = {}
    if not os.path.exists(GAMES_LOG):
        return games
    with open(GAMES_LOG, 'r', newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            games[row['game_id']] = row
    return games


def export(output_path):
    if not os.path.exists(MOVES_LOG):
        print(f"No moves log found at {MOVES_LOG}")
        return

    games = load_games_index()

    with open(output_path, 'w', newline='', encoding='utf-8') as out:
        writer = csv.writer(out)
        writer.writerow(PM4PY_HEADERS)

        with open(MOVES_LOG, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                gid = row['game_id']
                game_info = games.get(gid, {})
                writer.writerow([
                    gid,                                        # case:concept:name
                    row['move_san'],                            # concept:name
                    row['timestamp'],                           # time:timestamp
                    row['player'],                              # org:resource
                    row['move_number'],
                    row['move_uci'],
                    row['fen_before'],
                    row['fen_after'],
                    row['eval_before'],
                    row['eval_after'],
                    row['elo_setting'],
                    row['time_remaining'],
                    row.get('game_mode', ''),
                    game_info.get('result', ''),                # case:result
                    game_info.get('elo_setting', ''),           # case:elo_setting
                    game_info.get('player_color', ''),          # case:player_color
                    game_info.get('game_mode', ''),             # case:game_mode
                    game_info.get('player_age', ''),            # case:player_age
                    game_info.get('player2_age', ''),           # case:player2_age
                ])

    print(f"Event log exported to {output_path} ({sum(1 for _ in open(output_path)) - 1} events)")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Export chess game logs to pm4py format')
    parser.add_argument('--output', '-o', default=DEFAULT_OUTPUT, help='Output CSV path')
    args = parser.parse_args()
    export(args.output)
