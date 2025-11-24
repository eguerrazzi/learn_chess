# Scacchi vs Stockfish

Un'applicazione web moderna ed elegante per giocare a scacchi contro il potente motore Stockfish, realizzata con Flask e Python.

![Screenshot](https://via.placeholder.com/800x400?text=Anteprima+Applicazione)

## Caratteristiche

*   **Interfaccia Premium**: Design moderno "Dark Mode" con effetti Glassmorphism per un'esperienza visiva piacevole.
*   **Responsive**: Layout adattivo ottimizzato sia per Desktop che per Mobile.
*   **Motore Potente**: Integrazione diretta con Stockfish (eseguibile locale).
*   **Livello Regolabile**: Imposta l'ELO di Stockfish da 200 a 3200 per adattarlo al tuo livello di abilità.
*   **Analisi in Tempo Reale**: Visualizza la valutazione della mossa corrente e il vantaggio (es. +1.5, Mate in 3).
*   **Storico Partita**: Naviga avanti e indietro tra le mosse effettuate per analizzare la partita.

## Installazione

1.  Clona la repository o scarica i file.
2.  Assicurati di avere Python installato.
3.  Installa le dipendenze necessarie:
    ```bash
    pip install -r requirements.txt
    ```
4.  Assicurati che l'eseguibile di Stockfish sia presente nella cartella `stockfish/`.

## Avvio

Esegui l'applicazione con il comando:

```bash
python app.py
```

Apri il browser e vai all'indirizzo: `http://localhost:5000`

## Tecnologie Utilizzate

*   **Backend**: Python, Flask
*   **Frontend**: HTML5, CSS3 (Custom), JavaScript (jQuery)
*   **Librerie Scacchi**: 
    *   [python-chess](https://python-chess.readthedocs.io/) (Backend)
    *   [Chessboard.js](https://chessboardjs.com/) (Frontend UI)
    *   [Chess.js](https://github.com/jhlywa/chess.js) (Frontend Logic)

## Licenza

Questo progetto è distribuito sotto la licenza **GPLv3**. Vedi il file [LICENSE](LICENSE) per maggiori dettagli.
