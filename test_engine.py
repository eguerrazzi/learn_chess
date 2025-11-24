import chess
import chess.engine
import os

STOCKFISH_PATH = os.path.join(os.getcwd(), 'stockfish', 'stockfish-windows-x86-64-avx2.exe')

def test_engine():
    print(f"Testing engine at: {STOCKFISH_PATH}")
    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        print("Engine started.")
        
        # Test configuration
        elo = 1500
        print(f"Configuring ELO: {elo}")
        engine.configure({"UCI_LimitStrength": True, "UCI_Elo": elo})
        print("Configuration successful.")
        
        board = chess.Board()
        board.push_san("e4")
        
        print("Analyzing...")
        info = engine.analyse(board, chess.engine.Limit(time=0.1))
        print(f"Analysis result: {info}")
        
        print("Playing...")
        result = engine.play(board, chess.engine.Limit(time=0.5))
        print(f"Best move: {result.move}")
        
        engine.quit()
        print("Engine quit.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_engine()
