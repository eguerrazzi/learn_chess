# ♟️ Learn Chess — Piattaforma di Apprendimento Scacchistico con Process Mining

Applicazione web per imparare a giocare a scacchi, con analisi post-partita, coach AI e Process Mining integrato.

## Funzionalità

- **Gioca vs CPU** — Stockfish con ELO regolabile (200–3200) e motore debole per simulare avversari realistici
- **Gioca 1v1** — Modalità locale due giocatori sullo stesso browser
- **Analisi Post-Partita** — Classificazione mosse (best / excellent / good / inaccuracy / mistake / blunder), precisione %, momenti critici con scacchiera prima/dopo
- **Replay Interattivo** — Rivedi ogni partita mossa per mossa con scacchiera navigabile (frecce, click, bottoni)
- **Coach AI** — Report automatico rule-based + commento LLM opzionale tramite [Ollama](https://ollama.ai/)
- **Tutorial Interattivi** — 11 lezioni guidate con esercizi pratici sulla scacchiera
- **Dashboard Process Mining** — Analisi aperture, pattern di errore, correlazioni temporali (pm4py)
- **Analisi Salvate** — Archivio persistente di tutte le analisi con browser dedicato

## Requisiti

- **Python 3.10+**
- **[Stockfish](https://stockfishchess.org/download/)** — eseguibile per il proprio sistema operativo

## Installazione

### 1. Clona il repository

```bash
git clone https://github.com/eguerrazzi/learn_chess_pm.git
cd learn_chess_pm
```

### 2. Crea e attiva un virtual environment

**Windows:**
```bash
python -m venv venv
venv\Scripts\activate
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### 3. Installa le dipendenze

```bash
pip install -r requirements.txt
```

### 4. Stockfish

Scarica l'eseguibile di Stockfish per il tuo sistema operativo da [stockfishchess.org](https://stockfishchess.org/download/) e posizionalo nella cartella `stockfish/`.

| Sistema | File atteso |
|---------|-------------|
| Windows | `stockfish/stockfish-windows-x86-64-avx2.exe` |
| Linux   | `stockfish/stockfish-ubuntu-x86-64-avx2` (rendilo eseguibile con `chmod +x`) |

## Avvio

```bash
python app.py
```

Apri il browser all'indirizzo **http://localhost:5000**

## Configurazione Coach AI (LLM)

Il coach AI può generare commenti personalizzati sulla partita usando un modello LLM servito tramite [Ollama](https://ollama.ai/).

La configurazione avviene **esclusivamente tramite variabili d'ambiente**, senza modificare i file sorgente:

| Variabile | Default | Descrizione |
|-----------|---------|-------------|
| `OLLAMA_URL` | `http://localhost:11434` | URL del server Ollama |
| `OLLAMA_MODEL` | `llama3.1:8b` | Nome del modello da utilizzare |
| `COACH_MODE` | `rule_based` | Modalità coach di default: `rule_based` oppure `llm` |

### Esempi

**Windows (PowerShell):**
```powershell
$env:OLLAMA_URL = "http://il-tuo-server:11434"
$env:OLLAMA_MODEL = "llama3.1:8b"
python app.py
```

**Windows (CMD):**
```cmd
set OLLAMA_URL=http://il-tuo-server:11434
set OLLAMA_MODEL=llama3.1:8b
python app.py
```

**Linux / macOS:**
```bash
OLLAMA_URL=http://il-tuo-server:11434 OLLAMA_MODEL=llama3.1:8b python app.py
```

> **Nota:** Se Ollama non è raggiungibile, il sistema usa automaticamente il report rule-based come fallback. Il commento AI è anche attivabile on-demand dalla pagina Analisi Salvate.

## Struttura del Progetto

```
learn_chess/
├── app.py                 # Backend Flask principale
├── coach.py               # Coach AI (rule-based + LLM via Ollama)
├── weak_engine.py         # Motore debole realistico per livelli ELO bassi
├── game_logger.py         # Logging partite e mosse su CSV
├── export_event_log.py    # Export event log per strumenti di Process Mining
├── analysis/
│   └── pm_analysis.py     # Dashboard Process Mining (pm4py)
├── templates/             # Template HTML (Jinja2)
├── static/                # CSS, JS, immagini, dati tutorial
├── logs/                  # Dati partite e analisi (generati a runtime)
├── stockfish/             # Eseguibile Stockfish (da scaricare separatamente)
├── requirements.txt
└── LICENSE
```

## Tecnologie

| Componente | Tecnologia |
|------------|-----------|
| Backend | Python, Flask |
| Frontend | HTML5, CSS3 (dark glassmorphism), JavaScript, jQuery |
| Scacchiera | [Chessboard.js](https://chessboardjs.com/), [Chess.js](https://github.com/jhlywa/chess.js) |
| Motore | [Stockfish](https://stockfishchess.org/), [python-chess](https://python-chess.readthedocs.io/) |
| Process Mining | [pm4py](https://pm4py.fit.fraunhofer.de/) |
| Coach AI | [Ollama](https://ollama.ai/) (qualsiasi modello compatibile) |

## Licenza

Questo progetto è distribuito sotto la licenza **GNU General Public License v3.0**.
Vedi il file [LICENSE](LICENSE) per il testo completo.