import os
import chess
import chess.engine
from flask import Flask, render_template, request, jsonify
import weak_engine

app = Flask(__name__)

# Configuration
STOCKFISH_PATH = os.path.join(os.path.dirname(__file__), 'stockfish', 'stockfish-windows-x86-64-avx2.exe')

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

@app.route('/move', methods=['POST'])
def move():
    data = request.json
    fen = data.get('fen')
    elo = data.get('elo', 1500) # Default to 1500 if not provided

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

        # 2. Engine makes a move
        # Route to weak engine for ELO < 1350, otherwise use full Stockfish
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
            board.push(best_move)
            
            # 3. Analyze the new position (After engine move)
            info_engine = eng.analyse(board, chess.engine.Limit(time=0.1))
            score_engine = info_engine["score"].white()
            
            eval_engine = None
            if score_engine.is_mate():
                eval_engine = f"Mate in {score_engine.mate()}"
            else:
                eval_engine = score_engine.score() / 100.0
            
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

