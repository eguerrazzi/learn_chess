import requests
import json

def test_low_elo():
    url = "http://127.0.0.1:5000/move"
    # Initial position
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    
    payload = {
        "fen": fen,
        "elo": 200  # This should cause the crash
    }
    
    try:
        print(f"Sending request with ELO {payload['elo']}...")
        response = requests.post(url, json=payload)
        
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("Success! Response:", response.json())
        else:
            print("Error Response:", response.text)
            
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_low_elo()
