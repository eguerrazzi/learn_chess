import urllib.request
import urllib.error
import json
import chess

def test_move_endpoint():
    url = 'http://127.0.0.1:5000/move'
    
    # Start position
    board = chess.Board()
    # User plays e4
    board.push_san("e4")
    
    payload = {
        'fen': board.fen(),
        'elo': 1500
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    
    try:
        with urllib.request.urlopen(req) as response:
            if response.status == 200:
                response_body = response.read().decode('utf-8')
                data = json.loads(response_body)
                print("Response Status: 200 OK")
                print("Keys in response:", data.keys())
                
                if 'eval_user' in data and 'eval_engine' in data:
                    print(f"Success! eval_user: {data['eval_user']}, eval_engine: {data['eval_engine']}")
                else:
                    print("FAILED: Missing eval keys.")
                    
                print(f"Engine Move: {data.get('move')}")
            else:
                print(f"FAILED: Status Code {response.status}")
                
    except urllib.error.URLError as e:
        print(f"FAILED: Connection error: {e}")
    except Exception as e:
        print(f"FAILED: Error: {e}")

if __name__ == "__main__":
    test_move_endpoint()
