$(document).ready(function () {
    console.log("Script loaded v3 - Color Selection & Undo");
    var $deviceModal = $('#device-modal');
    var $deviceIndicator = $('#device-indicator');

    // Manual Device Selection Logic
    $('#desktopBtn').on('click', function () {
        $deviceIndicator.text("Desktop Mode");
        $deviceModal.fadeOut();
        initGame(false);
    });

    $('#mobileBtn').on('click', function () {
        $deviceIndicator.text("Mobile Mode");
        $deviceModal.fadeOut();
        initGame(true);
    });

    // Game Initialization Function
    function initGame(isMobile) {
        try {
            console.log("Starting initGame...");
            var board = null
            var game = new Chess()
            var $status = $('#status')
            var $fen = $('#fen')
            var $pgn = $('#pgn')
            var $evaluation = $('#evaluation')
            var playerColor = 'white'; // Default
            var selectedSquare = null; // Track selected square for click-click move
            var gameResigned = false; // Track if player has resigned
            var pendingPromotion = null; // Store pending promotion move details

            // Sounds (note: filenames are case-sensitive on some servers)
            var moveSound = new Audio('/static/sounds/move.mp3');
            var captureSound = new Audio('/static/sounds/capture.mp3');
            var checkSound = new Audio('/static/sounds/Check.mp3');
            var checkmateSound = new Audio('/static/sounds/Checkmate.mp3');

            function playSound(move) {
                // Priority: Checkmate > Check > Capture > Normal Move
                if (game.in_checkmate()) {
                    checkmateSound.currentTime = 0;
                    checkmateSound.play().catch(e => console.log("Audio play failed:", e));
                } else if (game.in_check()) {
                    checkSound.currentTime = 0;
                    checkSound.play().catch(e => console.log("Audio play failed:", e));
                } else if (move.flags.includes('c') || move.flags.includes('e')) { // Capture or En Passant
                    captureSound.currentTime = 0;
                    captureSound.play().catch(e => console.log("Audio play failed:", e));
                } else {
                    moveSound.currentTime = 0;
                    moveSound.play().catch(e => console.log("Audio play failed:", e));
                }
            }

            // History Management
            var fenHistory = ['start']
            var evalHistory = [null] // Align with fenHistory
            var currentMoveIndex = 0

            function onDragStart(source, piece, position, orientation) {
                // do not pick up pieces if the game is over
                if (game.game_over()) return false

                // only pick up pieces for the player's color
                var playerPiecePrefix = playerColor === 'white' ? 'w' : 'b';
                if (piece.search(new RegExp('^' + playerPiecePrefix)) === -1) {
                    return false;
                }

                // only pick up pieces for the side to move
                if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
                    (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
                    return false
                }

                // Disable moves if reviewing history
                if (currentMoveIndex !== fenHistory.length - 1) return false
            }

            function attemptMove(source, target) {
                // Check for promotion
                var piece = game.get(source);
                if (piece.type === 'p' &&
                    ((piece.color === 'w' && target.charAt(1) === '8') ||
                        (piece.color === 'b' && target.charAt(1) === '1'))) {

                    // It's a promotion!
                    // Check if move is valid (ignoring promotion piece for now, assuming queen for validation)
                    var tempMove = game.move({ from: source, to: target, promotion: 'q' });
                    if (tempMove === null) return null; // Invalid move
                    game.undo(); // Undo the temp move

                    // Store pending move and show modal
                    pendingPromotion = { source: source, target: target };
                    $('#promotion-modal').fadeIn();
                    return 'promotion'; // Signal that promotion is pending
                }

                // see if the move is legal
                var move = game.move({
                    from: source,
                    to: target,
                    promotion: 'q' // Default fallback, should not be reached for player moves if logic works
                })

                // illegal move
                if (move === null) return null

                // Play sound for user move
                playSound(move);

                // Update history
                fenHistory.push(game.fen())
                currentMoveIndex = fenHistory.length - 1

                updateStatus()

                // Check if game is over after user's move (user won)
                if (game.game_over()) {
                    return move;
                }

                // If move is legal and game continues, make engine move
                makeEngineMove()
                return move;
            }

            function onDrop(source, target) {
                if (gameResigned) return 'snapback'; // Block moves after resignation
                var move = attemptMove(source, target);
                if (move === null) return 'snapback';
                if (move === 'promotion') return; // Wait for modal selection
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

                            var moveObj = game.move(response.move, { sloppy: true }); // sloppy allows UCI
                            board.position(game.fen());

                            // Play sound for engine move
                            if (moveObj) {
                                playSound(moveObj);
                            }

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
                draggable: !isMobile,
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

            // Click-Click Interaction Logic
            function removeHighlights() {
                $('#board .square-55d63').removeClass('highlight-selected');
            }

            function highlightSquare(square) {
                var $square = $('#board .square-' + square);
                $square.addClass('highlight-selected');
            }

            $('#board').on('click', '.square-55d63', function () {
                console.log("Square clicked:", $(this).data('square'));
                var square = $(this).data('square');

                // Disable if game resigned
                if (gameResigned) return;

                // Disable if reviewing history or game over
                if (currentMoveIndex !== fenHistory.length - 1) return;
                if (game.game_over()) return;

                // Disable if not player's turn (engine thinking)
                if (game.turn() !== playerColor.charAt(0)) return;

                if (selectedSquare === null) {
                    // Select piece
                    var piece = game.get(square);
                    if (piece && piece.color === playerColor.charAt(0)) {
                        selectedSquare = square;
                        highlightSquare(square);
                    }
                } else {
                    // Move or Change Selection
                    if (square === selectedSquare) {
                        // Clicked same square -> Deselect
                        selectedSquare = null;
                        removeHighlights();
                    } else {
                        var move = attemptMove(selectedSquare, square);
                        if (move === 'promotion') {
                            // Valid promotion move initiated
                            selectedSquare = null;
                            removeHighlights();
                            return;
                        }
                        if (move) {
                            // Valid move
                            board.position(game.fen());
                            selectedSquare = null;
                            removeHighlights();
                        } else {
                            // Invalid move
                            // Is it a friendly piece? Change selection
                            var piece = game.get(square);
                            if (piece && piece.color === playerColor.charAt(0)) {
                                selectedSquare = square;
                                removeHighlights();
                                highlightSquare(square);
                            } else {
                                // Invalid move to empty or enemy square -> Deselect
                                selectedSquare = null;
                                removeHighlights();
                            }
                        }
                    }
                }
            });

            // Promotion Modal Handlers
            $('.promotion-btn').on('click', function () {
                var promotionPiece = $(this).data('piece');
                $('#promotion-modal').fadeOut();

                if (pendingPromotion) {
                    var move = game.move({
                        from: pendingPromotion.source,
                        to: pendingPromotion.target,
                        promotion: promotionPiece
                    });

                    if (move) {
                        playSound(move);
                        board.position(game.fen());
                        fenHistory.push(game.fen());
                        currentMoveIndex = fenHistory.length - 1;
                        updateStatus();

                        if (!game.game_over()) {
                            makeEngineMove();
                        }
                    }
                    pendingPromotion = null;
                }
            });

            // Event Listeners
            $('#startBtn').on('click', function () {
                playerColor = $('input[name="playerColor"]:checked').val();
                game.reset();
                board.start();
                gameResigned = false; // Reset resignation flag
                fenHistory = ['start'];
                evalHistory = [null];
                currentMoveIndex = 0;
                $evaluation.text("-");

                // Set board orientation based on player color
                if (playerColor === 'black') {
                    board.orientation('black');
                    // Engine makes first move
                    setTimeout(function () {
                        makeEngineMove();
                    }, 500);
                } else {
                    board.orientation('white');
                }

                updateStatus();
            });

            $('#resignBtn').on('click', function () {
                console.log('Resign button clicked, game over:', game.game_over());
                if (!game.game_over()) {
                    // Show resign confirmation modal
                    $('#resign-modal').fadeIn();
                }
            });

            // Resign confirmation handlers
            $('#confirmResignBtn').on('click', function () {
                $('#resign-modal').fadeOut();
                gameResigned = true; // Set resignation flag
                var winner = playerColor === 'white' ? 'Black' : 'White';
                $('#status').text(winner + ' wins by resignation');
                console.log('Player resigned, winner:', winner);
            });

            $('#cancelResignBtn').on('click', function () {
                $('#resign-modal').fadeOut();
            });

            $('#flipBtn').on('click', function () {
                board.flip();
            });

            // Undo Move Button
            $('#undoBtn').on('click', function () {
                // Can only undo if we're at the latest position and have moves to undo
                if (currentMoveIndex !== fenHistory.length - 1) {
                    alert("Cannot undo while reviewing history. Return to the latest position first.");
                    return;
                }

                // Need at least 2 moves to undo (user move + engine move)
                if (fenHistory.length < 3) { // start + user move + engine move
                    alert("No moves to undo.");
                    return;
                }

                // Remove last 2 moves (engine + user)
                fenHistory.pop(); // Remove engine move
                fenHistory.pop(); // Remove user move
                evalHistory.pop();
                evalHistory.pop();

                currentMoveIndex = fenHistory.length - 1;

                // Undo the moves in the game object
                game.undo(); // Undo engine move
                game.undo(); // Undo user move

                // Update board
                board.position(game.fen());

                // Update evaluation
                var evalText = evalHistory[currentMoveIndex] !== null ? evalHistory[currentMoveIndex] : "-";
                $evaluation.text(evalText);

                updateStatus();
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
