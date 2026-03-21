# Learn Chess — Piano di Sviluppo

## Obiettivo
Trasformare "Scacchi Pisani" da semplice app di gioco a **piattaforma didattica per novizi e principianti** (bambini e adulti), aggiungendo incrementalmente: logging strutturato → hint in-game → analisi post-partita → tutorial interattivo → process mining con pm4py.

I log delle partite (CSV) sono la **base per tutto**: feedback al giocatore **e** analisi con pm4py.

---

## Roadmap (5 fasi incrementali)

### Fase 1: Game Logging Infrastructure
Fondamenta per tutto il resto. Senza log, niente analisi, niente process mining.

1. **Generare `game_id`** (UUID) alla creazione di ogni partita. Il frontend lo invia ad ogni richiesta `/move`.
2. **Creare `game_logger.py`** — nuovo modulo che scrive su 2 file CSV:
   - **`logs/moves_log.csv`** — un record per mossa:
     `game_id, move_number, timestamp, player, move_san, move_uci, fen_before, fen_after, eval_before, eval_after, elo_setting, time_remaining`
   - **`logs/games_log.csv`** — un record per partita:
     `game_id, start_time, end_time, result, elo_setting, player_color, total_moves`
3. **Nuove route in `app.py`**:
   - `POST /new_game` → genera game_id, crea riga in games_log
   - `POST /move` → (modifica) accetta game_id, logga mossa utente + mossa engine
   - `POST /end_game` → registra risultato e timestamp fine
4. **Modifiche a `script.js`**:
   - New Game → chiama `/new_game`, salva game_id
   - Ogni mossa → invia game_id con la richiesta
   - Fine partita / resign / timeout → chiama `/end_game`
5. **Creare `export_event_log.py`** — converte i CSV in formato pm4py:
   - Case ID = game_id
   - Activity = move_san
   - Timestamp = timestamp mossa
   - Resource = player (user/engine)

**Verifica**: giocare 2+ partite, verificare CSV corretti, caricare in pm4py e generare process model base.

**File coinvolti**:
- `game_logger.py` (NUOVO)
- `export_event_log.py` (NUOVO)
- `app.py` (modifiche)
- `static/js/script.js` (modifiche)
- `logs/` (NUOVA directory, creata automaticamente)

---

### Fase 2: Hint System (on-demand) ✅
- Nuova route `POST /hint` — riceve FEN, restituisce best move da Stockfish (analisi 1s a piena potenza)
- Bottone \"💡 Hint\" nel frontend (verde) → evidenzia casella origine e destinazione sulla scacchiera per 4 secondi
- Log degli hint in `logs/hints_log.csv` (`game_id, move_number, timestamp, fen, hint_san, hint_uci`)
- Hint disabilitato quando non è il turno del giocatore, la partita è finita, o si sta navigando la storia

**File coinvolti**: `app.py` (route `/hint`), `script.js` (handler bottone), `index.html` (bottone), `style.css` (`.hint`, `.highlight-hint`), `game_logger.py` (`log_hint`, `hints_log.csv`)

---

### Fase 3: Analisi Post-Partita ✅
- **Classificazione mosse**: per ogni mossa utente, confronto con best move di Stockfish (0.3s full strength) → Best (<10cp) / Excellent (<25cp) / Good (<50cp) / Inaccuracy (<100cp) / Mistake (<200cp) / Blunder (≥200cp)
- **Replay con eval bar**: barra verticale laterale (sigmoid mapping) con navigazione mossa per mossa (click sulla lista + ◀▶)
- **Best move comparison**: per ogni errore, mostra "Best: Nf3" nella lista mosse
- **Report statistico**: accuracy % (formula Lichess), conteggio per categoria, avg CP loss
- Bottone "Analyze" (viola) appare a fine partita, analisi asincrona con indicatore di caricamento

**File coinvolti**: `app.py` (route `/analyze_game`, helper `_score_to_cp`), `script.js`, `style.css`, `index.html` (eval bar, analysis panel, analyze button)

---

### Fase 4: Tutorial Interattivo ✅
- Lezioni con scacchiera interattiva (riuso Chessboard.js):
  - Movimenti dei pezzi (uno per uno)
  - Catture
  - Scacco e scaccomatto
  - Arrocco
  - En passant
  - Promozione
  - Stallo
- Mini-esercizi: "muovi il cavallo qui", "trova lo scaccomatto in 1"
- Progressione: completare una lezione sblocca la successiva

**File coinvolti**: `templates/tutorial.html` (NUOVO), `static/js/tutorial.js` (NUOVO), `static/css/tutorial.css` (NUOVO), `static/tutorials/lessons.json` (NUOVO, 11 lezioni), `app.py` (route `/tutorial`), `index.html` (link navigazione), `style.css` (`.nav-link`)

---

### Fase 5: Process Mining con pm4py ✅
- Script/notebook per analisi:
  - **Process discovery**: sequenze di aperture più comuni, DFG (Directly-Follows Graph)
  - **Pattern di errore**: distribuzione errori per fase (apertura/mediogioco/finale), peggiori mosse, tasso errori per ELO
  - **Correlazioni**: ELO scelto ↔ risultato (win rate), uso hint ↔ miglioramento (win rate con/senza suggerimenti)
- Dashboard web interattiva con riepilogo, grafici, tabelle

**File coinvolti**: `analysis/__init__.py` (NUOVO), `analysis/pm_analysis.py` (NUOVO), `templates/dashboard.html` (NUOVO), `static/js/dashboard.js` (NUOVO), `static/css/dashboard.css` (NUOVO), `app.py` (route `/dashboard`, `/api/dashboard`), `index.html` (link navigazione), `requirements.txt` (pm4py, pandas, matplotlib)

---

## Struttura Event Log per Process Mining

### Scelta: un evento = una mossa

Motivazioni:
- Permette il **process discovery sulle aperture** (sequenze di mosse come flussi)
- Localizza **dove** nel gioco avvengono gli errori
- Si può sempre aggregare a livello partita per analisi macro
- Ogni mossa porta contesto (eval, tempo) utile per clustering

### Mappatura pm4py
| Campo pm4py      | Campo CSV          | Esempio               |
|------------------|--------------------|-----------------------|
| Case ID          | `game_id`          | `a1b2c3d4-...`        |
| Activity         | `move_san`         | `e4`, `Nf3`, `O-O`    |
| Timestamp        | `timestamp`        | `2026-03-18T14:30:05` |
| Resource         | `player`           | `user` / `engine`     |
| case:result      | `result`           | `win` / `loss` / ...  |
| case:elo_setting | `elo_setting`      | `800`                 |

---

## Decisioni architetturali
- **No account utente**: ogni partita identificata solo da `game_id`, nessun tracking cross-sessione
- **CSV per persistenza**: leggero, facile da leggere con pandas/pm4py, zero configurazione
- **Soglie classificazione mosse**: blunder ≥200cp, mistake ≥100cp, inaccuracy ≥50cp
- **Hint semplice**: mostra solo best move, non varianti o spiegazioni (per ora)
- **Approccio incrementale**: una fase alla volta, ogni fase verificata prima di procedere
