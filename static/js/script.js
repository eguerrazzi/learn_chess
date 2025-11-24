$(document).ready(function () {
    console.log("Script loaded v2 - Cache Busting");
    var $deviceModal = $('#device-modal');
    var $deviceIndicator = $('#device-indicator');

    // Manual Device Selection Logic
    $('#desktopBtn').on('click', function () {
        $deviceIndicator.text("Desktop Mode");
        $deviceModal.fadeOut();
        initGame();
    });

    $('#mobileBtn').on('click', function () {
        $deviceIndicator.text("Mobile Mode");
        $deviceModal.fadeOut();
        initGame();
    });

    // Game Initialization Function
    function initGame() {
        try {
            console.log("Starting initGame...");
            var board = null
            var game = new Chess()
            var $status = $('#status')
            var $fen = $('#fen')
            var $pgn = $('#pgn')
            var $evaluation = $('#evaluation')

            // History Management
            var fenHistory = ['start']
            var evalHistory = [null] // Align with fenHistory
            var currentMoveIndex = 0

            function onDragStart(source, piece, position, orientation) {
                // do not pick up pieces if the game is over
                if (game.game_over()) return false

                // only pick up pieces for the side to move
                if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
                    (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
                    return false
                }

                // Disable moves if reviewing history
                if (currentMoveIndex !== fenHistory.length - 1) return false
            }

            function onDrop(source, target) {
                // see if the move is legal
                var move = game.move({
                    from: source,
                    to: target,
                    promotion: 'q' // NOTE: always promote to a queen for example simplicity
                })

                // illegal move
                if (move === null) return 'snapback'

                // Update history
                fenHistory.push(game.fen())
                currentMoveIndex = fenHistory.length - 1

                updateStatus()

                // If move is legal, make engine move
                makeEngineMove()
            }

            // update the board position after the piece snap
            // for castling, en passant, pawn promotion
            function onSnapEnd() {
                board.position(game.fen())
            }

            function updateStatus() {
                var status = ''

                var moveColor = 'White'
                if (game.turn() === 'b') {
                    moveColor = 'Black'
                }

                // checkmate?
                if (game.in_checkmate()) {
                    status = 'Game over, ' + moveColor + ' is in checkmate.'
                }

                // draw?
                else if (game.in_draw()) {
                    status = 'Game over, drawn position'
                }

                // game still on
                else {
                    status = moveColor + ' to move'

                    // check?
                    if (game.in_check()) {
                        status += ', ' + moveColor + ' is in check'
                    }
                }

                $status.html(status)
                $pgn.html(game.pgn())
            }

            function makeEngineMove() {
                var elo = $('#elo').val();
                $status.text("Engine thinking...");

                $.ajax({
                    url: '/move',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        fen: game.fen(),
                        elo: parseInt(elo)
                    }),
                    success: function (response) {
                        if (response.evaluation) {
                            $evaluation.text(response.evaluation);
                        }

                        if (response.move) {
                            // Store eval for the user's move (current state before engine move)
                            if (response.eval_user !== undefined) {
                                if (evalHistory.length <= currentMoveIndex) {
                                    evalHistory.push(response.eval_user);
                                } else {
                                    evalHistory[currentMoveIndex] = response.eval_user;
                                }
                            }

                            game.move(response.move, { sloppy: true }); // sloppy allows UCI
                            board.position(game.fen());

                            // Update history
                            fenHistory.push(game.fen());
                            if (response.eval_engine !== undefined) {
                                evalHistory.push(response.eval_engine);
                            } else {
                                evalHistory.push(null);
                            }

                            currentMoveIndex = fenHistory.length - 1;

                            // Update display
                            if (response.eval_engine) {
                                $evaluation.text(response.eval_engine);
                            }

                            updateStatus();
                        }
                        if (response.game_over) {
                            // Handle game over if needed beyond updateStatus
                        }
                    },
                    error: function (error) {
                        console.error("Error getting engine move:", error);
                        $status.text("Error communicating with engine.");
                    }
                });
            }

            var config = {
                draggable: true,
                position: 'start',
                onDragStart: onDragStart,
                onDrop: onDrop,
                onSnapEnd: onSnapEnd,
                pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
            }

            console.log("Initializing Chessboard...");
            board = Chessboard('board', config)
            console.log("Board initialized:", board);
            updateStatus()

            // Force resize to ensure board renders if initially 0 width
            setTimeout(function () {
                console.log("Resizing board...");
                if (board) board.resize();
            }, 500);

            // Event Listeners
            $('#startBtn').on('click', function () {
                game.reset();
                board.start();
                fenHistory = ['start'];
                evalHistory = [null];
                currentMoveIndex = 0;
                $evaluation.text("-");
                updateStatus();
            });

            $('#flipBtn').on('click', function () {
                board.flip();
            });

            $(window).resize(function () {
                if (board) board.resize();
            });

            // History Navigation
            $('#prevBtn').on('click', function () {
                if (currentMoveIndex > 0) {
                    currentMoveIndex--;
                    currentMoveIndex--; // Jump back 2 for full move? Or 1? Keeping original logic for now.
                    if (currentMoveIndex < 0) currentMoveIndex = 0; // Safety

                    board.position(fenHistory[currentMoveIndex]);
                    var evalText = evalHistory[currentMoveIndex] !== null ? evalHistory[currentMoveIndex] : "-";
                    $evaluation.text(evalText);
                }
            });

            $('#nextBtn').on('click', function () {
                if (currentMoveIndex < fenHistory.length - 1) {
                    currentMoveIndex++;
                    currentMoveIndex++; // Jump fwd 2
                    if (currentMoveIndex >= fenHistory.length) currentMoveIndex = fenHistory.length - 1; // Safety

                    board.position(fenHistory[currentMoveIndex]);
                    var evalText = evalHistory[currentMoveIndex] !== null ? evalHistory[currentMoveIndex] : "-";
                    $evaluation.text(evalText);
                }
            });

        } catch (e) {
            console.error("Critical Error in initGame:", e);
            $('#status').text("Error initializing game: " + e.message);
        }
    }
});
