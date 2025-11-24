import urllib.request
import os

base = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/sound/standard/'
files = ['Move.mp3', 'Capture.mp3']
target_dir = os.path.join('static', 'sounds')

os.makedirs(target_dir, exist_ok=True)

for f in files:
    url = base + f
    path = os.path.join(target_dir, f)
    print(f"Downloading {url} to {path}...")
    try:
        urllib.request.urlretrieve(url, path)
        print("Success.")
    except Exception as e:
        print(f"Failed: {e}")
