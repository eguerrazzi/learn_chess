"""
Weak Chess Engine Module

Provides move selection for low ELO ratings (200-1350) by simulating
beginner-level play through random moves and limited-depth Stockfish analysis.

For ELO >= 1350, the main app.py uses full Stockfish with UCI_Elo.
"""

import random
import chess
import chess.engine


def get_weak_move(board, elo, stockfish_engine):
    """
    Get a move appropriate for the given ELO level.
    
    Args:
        board: chess.Board object representing current position
        elo: int, target ELO rating (200-1350)
        stockfish_engine: chess.engine.SimpleEngine instance
        
    Returns:
        chess.Move object
    """
    if elo < 600:
        # Very weak: mostly random with some heuristics
        return get_random_move(board, elo)
    else:
        # Weak-intermediate: limited Stockfish with blunders
        return get_limited_stockfish_move(board, elo, stockfish_engine)


def get_random_move(board, elo):
    """
    Generate a random move with basic heuristics.
    
    For very low ELO (200-600), this simulates a complete beginner who:
    - Mostly makes random legal moves
    - Occasionally prefers captures or checks (probability increases with ELO)
    
    Args:
        board: chess.Board object
        elo: int, ELO rating (200-600)
        
    Returns:
        chess.Move object
    """
    legal_moves = list(board.legal_moves)
    
    if not legal_moves:
        return None
    
    # Calculate probability of using heuristics (0.0 at ELO 200, 0.5 at ELO 600)
    heuristic_prob = (elo - 200) / 800.0  # Scales from 0.0 to 0.5
    
    if random.random() < heuristic_prob:
        # Try to find captures or checks
        captures = [m for m in legal_moves if board.is_capture(m)]
        checks = [m for m in legal_moves if board.gives_check(m)]
        
        # Prefer captures over checks
        if captures and random.random() < 0.7:
            return random.choice(captures)
        elif checks and random.random() < 0.5:
            return random.choice(checks)
    
    # Default: completely random move
    return random.choice(legal_moves)


def get_limited_stockfish_move(board, elo, engine):
    """
    Use Stockfish with limited depth and intentional blunders.
    
    For ELO 600-1350, this simulates a player who:
    - Can see some tactics but not deep combinations
    - Occasionally makes blunders (ignores best move)
    
    Args:
        board: chess.Board object
        elo: int, ELO rating (600-1350)
        engine: chess.engine.SimpleEngine instance
        
    Returns:
        chess.Move object
    """
    # Determine search depth based on ELO
    if elo < 700:
        depth = 1
        blunder_prob = 0.5  # 50% chance to blunder
    elif elo < 1000:
        depth = 2
        blunder_prob = 0.3  # 30% chance to blunder
    else:  # 1000-1350
        depth = 3
        blunder_prob = 0.1  # 10% chance to blunder
    
    # Get multiple move options from Stockfish
    try:
        # Analyze with MultiPV to get top 5 moves
        info = engine.analyse(
            board, 
            chess.engine.Limit(depth=depth),
            multipv=5
        )
        
        # Extract moves from the analysis
        candidate_moves = []
        for pv_info in info:
            if 'pv' in pv_info and len(pv_info['pv']) > 0:
                candidate_moves.append(pv_info['pv'][0])
        
        if not candidate_moves:
            # Fallback to simple play
            result = engine.play(board, chess.engine.Limit(depth=depth))
            return result.move
        
        # Decide whether to blunder
        if random.random() < blunder_prob and len(candidate_moves) > 1:
            # Pick a random move from 2nd-5th best (blunder)
            return random.choice(candidate_moves[1:])
        else:
            # Play the best move
            return candidate_moves[0]
            
    except Exception as e:
        print(f"Error in limited Stockfish analysis: {e}")
        # Fallback to simple random move
        legal_moves = list(board.legal_moves)
        return random.choice(legal_moves) if legal_moves else None
