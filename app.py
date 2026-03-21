import os
import uuid
import chess
import chess.engine
from flask import Flask, render_template, request, jsonify
import weak_engine
import game_logger
import platform
import math
from analysis.pm_analysis import get_dashboard_data

app = Flask(__name__)

# Configurazione Stockfish
def get_stockfish_path():
    base_dir = os.path.dirname(__file__)
    stockfish_dir = os.path.join(base_dir, 'stockfish')
    
    system = platform.system()
    if system == "Windows":
        return os.path.join(stockfish_dir, 'stockfish-windows-x86-64-avx2.exe')
    elif system == "Linux":
        path = os.path.join(stockfish_dir, 'stockfish-ubuntu-x86-64-avx2')
        # Assicura che sia eseguibile su Linux
        if os.path.exists(path):
            os.chmod(path, 0o755)
        return path
    else:
        raise Exception(f"Sistema operativo non supportato: {system}")

STOCKFISH_PATH =  get_stockfish_path()

# Global engine instance (simple approach for local single-user app)
# In a real multi-user production app, this would need a pool or per-session handling.
engine = None

def get_engine():
    global engine
    if engine is None:
        try:
            engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        except FileNotFoundError:
            print(f"Stockfish not found at {STOCKFISH_PATH}")
            return None
    return engine

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/tutorial')
def tutorial():
    return render_template('tutorial.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

@app.route('/api/dashboard')
def api_dashboard():
    data = get_dashboard_data()
    return jsonify(data)

@app.route('/new_game', methods=['POST'])
def new_game():
    data = request.json or {}
    game_id = str(uuid.uuid4())
    elo = data.get('elo', 1500)
    player_color = data.get('player_color', 'white')
    game_mode = data.get('game_mode', 'cpu')
    player_age = data.get('player_age', '')
    player2_age = data.get('player2_age', '')
    game_logger.log_new_game(game_id, elo, player_color, game_mode,
                             player_age, player2_age)
    return jsonify({'game_id': game_id})


@app.route('/end_game', methods=['POST'])
def end_game():
    data = request.json or {}
    game_id = data.get('game_id')
    result = data.get('result', 'unknown')
    total_moves = data.get('total_moves', 0)
    if game_id:
        game_logger.log_end_game(game_id, result, total_moves)
    return jsonify({'status': 'ok'})


@app.route('/move', methods=['POST'])
def move():
    data = request.json
    fen = data.get('fen')
    elo = data.get('elo', 1500) # Default to 1500 if not provided
    game_id = data.get('game_id')
    move_number = data.get('move_number', 0)
    user_move_san = data.get('user_move_san', '')
    user_move_uci = data.get('user_move_uci', '')
    fen_before_user = data.get('fen_before_user', '')
    time_remaining = data.get('time_remaining')

    if not fen:
        return jsonify({'error': 'No FEN provided'}), 400

    board = chess.Board(fen)
    
    if board.is_game_over():
        return jsonify({'game_over': True, 'result': board.result()})

    eng = get_engine()
    if not eng:
        return jsonify({'error': 'Stockfish engine not available'}), 500

    try:
        # 1. Analyze the current position (User's move just happened)
        info_user = eng.analyse(board, chess.engine.Limit(time=0.1))
        
        # Score from White's perspective for consistency
        score_user = info_user["score"].white()
        
        eval_user = None
        if score_user.is_mate():
            eval_user = f"Mate in {score_user.mate()}"
        else:
            eval_user = score_user.score() / 100.0

        # Log user's move
        if game_id and user_move_san:
            game_logger.log_move(
                game_id, move_number, 'user', user_move_san, user_move_uci,
                fen_before_user, fen, eval_user, eval_user,
                elo, time_remaining, 'cpu'
            )

        # 2. Engine makes a move
        # Route to weak engine for ELO < 1350, otherwise use full Stockfish
        fen_before_engine = board.fen()
        if int(elo) < 1350:
            # Use weak engine for low ELO
            best_move = weak_engine.get_weak_move(board, int(elo), eng)
        else:
            # Use full Stockfish with UCI_Elo for high ELO
            safe_elo = max(1350, int(elo))
            eng.configure({"UCI_LimitStrength": True, "UCI_Elo": safe_elo})
            limit = chess.engine.Limit(time=0.5) 
            result = eng.play(board, limit)
            best_move = result.move
        
        if best_move:
            # Get SAN before pushing (SAN needs current board state)
            engine_move_san = board.san(best_move)
            engine_move_uci = best_move.uci()
            board.push(best_move)
            
            # 3. Analyze the new position (After engine move)
            info_engine = eng.analyse(board, chess.engine.Limit(time=0.1))
            score_engine = info_engine["score"].white()
            
            eval_engine = None
            if score_engine.is_mate():
                eval_engine = f"Mate in {score_engine.mate()}"
            else:
                eval_engine = score_engine.score() / 100.0

            # Log engine's move
            if game_id:
                game_logger.log_move(
                    game_id, move_number, 'engine', engine_move_san, engine_move_uci,
                    fen_before_engine, board.fen(), eval_user, eval_engine,
                    elo, None, 'cpu'
                )
            
            return jsonify({
                'fen': board.fen(),
                'move': best_move.uci(),
                'game_over': board.is_game_over(),
                'eval_user': eval_user,      # Eval after user move
                'eval_engine': eval_engine   # Eval after engine move
            })
        else:
             return jsonify({'error': 'Engine could not find a move'}), 500

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/move_pvp', methods=['POST'])
def move_pvp():
    """Log a move in 1v1 (PvP) mode. No engine involved."""
    data = request.json or {}
    game_id = data.get('game_id')
    move_number = data.get('move_number', 0)
    player = data.get('player', 'white')
    move_san = data.get('move_san', '')
    move_uci = data.get('move_uci', '')
    fen_before = data.get('fen_before', '')
    fen_after = data.get('fen_after', '')
    time_remaining = data.get('time_remaining')

    if game_id and move_san:
        game_logger.log_move(
            game_id, move_number, player, move_san, move_uci,
            fen_before, fen_after, '', '',
            '', time_remaining, 'pvp'
        )
    return jsonify({'status': 'ok'})


@app.route('/hint', methods=['POST'])
def hint():
    data = request.json
    fen = data.get('fen')
    game_id = data.get('game_id')
    move_number = data.get('move_number', 0)

    if not fen:
        return jsonify({'error': 'No FEN provided'}), 400

    board = chess.Board(fen)
    if board.is_game_over():
        return jsonify({'error': 'Game is over'}), 400

    eng = get_engine()
    if not eng:
        return jsonify({'error': 'Stockfish engine not available'}), 500

    try:
        # Full-strength analysis for best move suggestion
        eng.configure({"UCI_LimitStrength": False})
        result = eng.play(board, chess.engine.Limit(time=1.0))
        best_move = result.move

        best_san = board.san(best_move)
        best_uci = best_move.uci()

        # Log that a hint was requested
        if game_id:
            game_logger.log_hint(game_id, move_number, fen, best_san, best_uci)

        return jsonify({
            'from': best_uci[:2],
            'to': best_uci[2:4],
            'move_san': best_san,
            'move_uci': best_uci
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def _score_to_cp(score):
    """Convert a chess.engine PovScore (White perspective) to centipawns."""
    if score.is_mate():
        m = score.mate()
        return (10000 - abs(m) * 10) * (1 if m > 0 else -1)
    return score.score()


@app.route('/analyze_game', methods=['POST'])
def analyze_game():
    data = request.json
    moves_uci = data.get('moves', [])
    player_color = data.get('player_color', 'white')

    if not moves_uci:
        return jsonify({'error': 'No moves provided'}), 400

    eng = get_engine()
    if not eng:
        return jsonify({'error': 'Engine not available'}), 500

    eng.configure({"UCI_LimitStrength": False})
    board = chess.Board()
    results = []
    user_cp_losses = []

    # Analyze starting position
    info_start = eng.analyse(board, chess.engine.Limit(time=0.1))
    start_eval = _score_to_cp(info_start['score'].white())

    for i, move_uci_str in enumerate(moves_uci):
        ply = i + 1
        is_white_move = (i % 2 == 0)
        is_user = (is_white_move and player_color == 'white') or \
                  (not is_white_move and player_color == 'black')

        move = chess.Move.from_uci(move_uci_str)
        move_san = board.san(move)

        entry = {
            'ply': ply,
            'move_san': move_san,
            'is_user': is_user,
        }

        if is_user:
            # Analyze position before user's move (full strength)
            info_before = eng.analyse(board, chess.engine.Limit(time=0.3))
            best_pv = info_before.get('pv', [])
            best_move = best_pv[0] if best_pv else None
            eval_before = _score_to_cp(info_before['score'].white())
            best_san = board.san(best_move) if best_move else '?'

            # Push actual move and analyze
            board.push(move)
            info_after = eng.analyse(board, chess.engine.Limit(time=0.2))
            eval_after = _score_to_cp(info_after['score'].white())

            # CP loss (from the moving side's perspective)
            side = 1 if is_white_move else -1
            cp_loss = max(0, round((eval_before - eval_after) * side))
            was_best = (move == best_move)

            if was_best or cp_loss < 10:
                classification = 'best'
            elif cp_loss < 25:
                classification = 'excellent'
            elif cp_loss < 50:
                classification = 'good'
            elif cp_loss < 100:
                classification = 'inaccuracy'
            elif cp_loss < 200:
                classification = 'mistake'
            else:
                classification = 'blunder'

            entry.update({
                'classification': classification,
                'cp_loss': cp_loss,
                'best_move_san': best_san,
                'eval_after': eval_after,
                'fen_after': board.fen()
            })
            user_cp_losses.append(cp_loss)
        else:
            # Engine move — quick eval
            board.push(move)
            info = eng.analyse(board, chess.engine.Limit(time=0.1))
            eval_after = _score_to_cp(info['score'].white())
            entry['eval_after'] = eval_after
            entry['fen_after'] = board.fen()

        results.append(entry)

    # Summary
    avg_cp = sum(user_cp_losses) / len(user_cp_losses) if user_cp_losses else 0
    accuracy = max(0, min(100, 103.1668 * math.exp(-0.04354 * avg_cp) - 3.1668))

    counts = {'best': 0, 'excellent': 0, 'good': 0,
              'inaccuracy': 0, 'mistake': 0, 'blunder': 0}
    for r in results:
        if r.get('is_user') and r.get('classification'):
            counts[r['classification']] += 1

    return jsonify({
        'moves': results,
        'start_eval': start_eval,
        'summary': {
            'accuracy': round(accuracy, 1),
            'avg_cp_loss': round(avg_cp),
            'total_user_moves': len(user_cp_losses),
            **counts
        }
    })


@app.route('/reset', methods=['POST'])
def reset():
    # Just a dummy endpoint if we needed server-side state, 
    # but we are keeping state mostly in frontend (FEN) for simplicity.
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))

    try:
        app.run(
            host="0.0.0.0",
            port=port,
            debug=False  # obbligatorio su Render
        )
    finally:
        if engine:
            engine.quit()

