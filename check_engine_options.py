import os
import chess.engine

STOCKFISH_PATH = os.path.join(os.path.dirname(__file__), 'stockfish', 'stockfish-windows-x86-64-avx2.exe')

def check_options():
    if not os.path.exists(STOCKFISH_PATH):
        print(f"Stockfish not found at {STOCKFISH_PATH}")
        return

    try:
        engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        print("Engine loaded successfully.")
        
        print("\nAvailable Options:")
        for name, option in engine.options.items():
            print(f"{name}: {option}")
            
        if "UCI_Elo" in engine.options:
            elo_opt = engine.options["UCI_Elo"]
            print(f"\nUCI_Elo details: Min={elo_opt.min}, Max={elo_opt.max}, Default={elo_opt.default}")
        else:
            print("\nUCI_Elo option not found!")

        engine.quit()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_options()
