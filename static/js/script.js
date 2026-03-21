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

            // Logging variables
            var gameId = null; // Current game UUID from server
            var moveNumber = 0; // Incremented after each user+engine move pair
            var gameMode = 'cpu'; // 'cpu' or 'pvp'

            // Analysis variables
            var analysisData = null;
            var analysisMode = false;
            var currentAnalysisPly = 0;

            // Timer variables
            var playerTimeRemaining = 0; // in seconds
            var player2TimeRemaining = 0; // in seconds (PvP mode)
            var timeIncrement = 0; // in seconds
            var timerInterval = null;
            var activeTimerSide = 'w'; // which side's clock is running
            var timeControlConfig = {
                'bullet': { initial: 60, increment: 1 },      // 1 min + 1 sec
                'blitz': { initial: 180, increment: 2 },      // 3 min + 2 sec
                'rapid': { initial: 600, increment: 5 },      // 10 min + 5 sec
                'classical': { initial: 1800, increment: 0 }, // 30 min + 0 sec
                'none': { initial: 0, increment: 0 }          // No time limit
            };

            // Sounds (note: filenames are case-sensitive on some servers)
            var moveSound = new Audio('/static/sounds/move.mp3');
            var captureSound = new Audio('/static/sounds/capture.mp3');
            var checkSound = new Audio('/static/sounds/Check.mp3');
            var checkmateSound = new Audio('/static/sounds/Checkmate.mp3');

            // Timer Functions
            function loadTimeControl() {
                var saved = localStorage.getItem('timeControl');
                if (saved && timeControlConfig[saved]) {
                    $('#timeControl').val(saved);
                }
            }

            function saveTimeControl() {
                var selected = $('#timeControl').val();
                localStorage.setItem('timeControl', selected);
            }

            function initializeTimer() {
                var timeControl = $('#timeControl').val();
                var config = timeControlConfig[timeControl];
                
                if (config.initial === 0) {
                    // No time limit
                    playerTimeRemaining = 0;
                    player2TimeRemaining = 0;
                    timeIncrement = 0;
                    $('#player-timer').text('∞').removeClass('timer-warning');
                } else {
                    playerTimeRemaining = config.initial;
                    player2TimeRemaining = config.initial;
                    timeIncrement = config.increment;
                    updateTimerDisplay();
                }
            }

            function updateTimerDisplay() {
                if (playerTimeRemaining === 0 && $('#timeControl').val() === 'none') {
                    $('#player-timer').text('∞');
                    return;
                }

                // In PvP, show active side's time
                var timeToShow = playerTimeRemaining;
                if (gameMode === 'pvp') {
                    timeToShow = (activeTimerSide === 'w') ? playerTimeRemaining : player2TimeRemaining;
                }

                var minutes = Math.floor(timeToShow / 60);
                var seconds = timeToShow % 60;
                var display = String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
                
                $('#player-timer').text(display);
                
                // Add warning class if time is low
                if (timeToShow < 10 && timeToShow > 0) {
                    $('#player-timer').addClass('timer-warning');
                } else {
                    $('#player-timer').removeClass('timer-warning');
                }
            }

            function startPlayerTimer() {
                // Only start if time control is enabled and timer not already running
                if ($('#timeControl').val() === 'none' || timerInterval !== null) return;
                
                timerInterval = setInterval(function() {
                    if (gameMode === 'pvp') {
                        if (activeTimerSide === 'w') {
                            playerTimeRemaining--;
                            if (playerTimeRemaining <= 0) {
                                playerTimeRemaining = 0;
                                stopPlayerTimer();
                                handleTimeout();
                                return;
                            }
                        } else {
                            player2TimeRemaining--;
                            if (player2TimeRemaining <= 0) {
                                player2TimeRemaining = 0;
                                stopPlayerTimer();
                                handleTimeout();
                                return;
                            }
                        }
                    } else {
                        playerTimeRemaining--;
                        if (playerTimeRemaining <= 0) {
                            playerTimeRemaining = 0;
                            stopPlayerTimer();
                            handleTimeout();
                            return;
                        }
                    }
                    updateTimerDisplay();
                }, 1000);
            }

            function stopPlayerTimer() {
                if (timerInterval !== null) {
                    clearInterval(timerInterval);
                    timerInterval = null;
                }
            }

            function addPlayerIncrement() {
                if ($('#timeControl').val() === 'none') return;
                if (gameMode === 'pvp') {
                    if (activeTimerSide === 'w') {
                        playerTimeRemaining += timeIncrement;
                    } else {
                        player2TimeRemaining += timeIncrement;
                    }
                } else {
                    playerTimeRemaining += timeIncrement;
                }
                updateTimerDisplay();
            }

            function switchTimer() {
                stopPlayerTimer();
                activeTimerSide = (activeTimerSide === 'w') ? 'b' : 'w';
                updateTimerDisplay();
                startPlayerTimer();
            }

            function handleTimeout() {
                gameResigned = true;
                if (gameMode === 'pvp') {
                    var winner = (activeTimerSide === 'w') ? 'Black (SNS)' : 'White (SSSUP)';
                    $('#status').text(winner + ' wins on time!');
                    var result = (activeTimerSide === 'w') ? 'white_timeout' : 'black_timeout';
                    endGameOnServer(result);
                } else {
                    var winner = playerColor === 'white' ? 'Black' : 'White';
                    $('#status').text(winner + ' wins on time!');
                    endGameOnServer('timeout');
                }
            }

            // Load saved time control on init
            loadTimeControl();

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

                if (gameMode === 'pvp') {
                    // In PvP, only allow the side whose turn it is
                    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
                        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
                        return false
                    }
                } else {
                    // In CPU mode, only pick up player's pieces
                    var playerPiecePrefix = playerColor === 'white' ? 'w' : 'b';
                    if (piece.search(new RegExp('^' + playerPiecePrefix)) === -1) {
                        return false;
                    }

                    // only pick up pieces for the side to move
                    if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
                        (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
                        return false
                    }
                }

                // Disable moves if reviewing history
                if (currentMoveIndex !== fenHistory.length - 1) return false
            }

            function attemptMove(source, target) {
                // Check if timer has expired (check active side in PvP)
                if ($('#timeControl').val() !== 'none') {
                    if (gameMode === 'pvp') {
                        var activeTime = (game.turn() === 'w') ? playerTimeRemaining : player2TimeRemaining;
                        if (activeTime <= 0) return null;
                    } else {
                        if (playerTimeRemaining === 0) return null;
                    }
                }

                // Capture FEN before the move for logging
                var fenBeforeMove = game.fen();

                // Check for promotion
                var piece = game.get(source);
                if (piece.type === 'p' &&
                    ((piece.color === 'w' && target.charAt(1) === '8') ||
                        (piece.color === 'b' && target.charAt(1) === '1'))) {

                    // It's a promotion!
                    var tempMove = game.move({ from: source, to: target, promotion: 'q' });
                    if (tempMove === null) return null;
                    game.undo();

                    pendingPromotion = { source: source, target: target, fenBefore: fenBeforeMove };
                    $('#promotion-modal').fadeIn();
                    return 'promotion';
                }

                // see if the move is legal
                var move = game.move({
                    from: source,
                    to: target,
                    promotion: 'q'
                })

                // illegal move
                if (move === null) return null

                // Stop timer and add increment after successful move
                stopPlayerTimer();
                addPlayerIncrement();

                // Play sound
                playSound(move);

                // Update history
                fenHistory.push(game.fen())
                currentMoveIndex = fenHistory.length - 1
                moveNumber++;

                updateStatus()

                if (gameMode === 'pvp') {
                    // PvP: log move and switch timer
                    logPvpMove(move, fenBeforeMove);

                    if (game.game_over()) {
                        stopPlayerTimer();
                        var result = 'draw';
                        if (game.in_checkmate()) {
                            // The side that just moved delivered checkmate
                            result = (move.color === 'w') ? 'white_wins' : 'black_wins';
                        }
                        endGameOnServer(result);
                        return move;
                    }

                    // Switch timer to other side
                    switchTimer();
                    return move;
                }

                // CPU mode: check game over, then call engine
                if (game.game_over()) {
                    stopPlayerTimer();
                    var result = 'draw';
                    if (game.in_checkmate()) {
                        result = 'win';
                    }
                    endGameOnServer(result);
                    return move;
                }

                makeEngineMove()
                return move;
            }

            function logPvpMove(move, fenBefore) {
                if (!gameId) return;
                var playerLabel = (move.color === 'w') ? 'white' : 'black';
                var timeRem = ($('#timeControl').val() === 'none') ? null :
                    ((move.color === 'w') ? playerTimeRemaining : player2TimeRemaining);
                $.ajax({
                    url: '/move_pvp',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        game_id: gameId,
                        move_number: moveNumber,
                        player: playerLabel,
                        move_san: move.san,
                        move_uci: move.from + move.to + (move.promotion || ''),
                        fen_before: fenBefore,
                        fen_after: game.fen(),
                        time_remaining: timeRem
                    })
                });
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

            function endGameOnServer(result) {
                if (!gameId) return;
                $('#analyzeBtn').show();
                $.ajax({
                    url: '/end_game',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        game_id: gameId,
                        result: result,
                        total_moves: moveNumber
                    })
                });
            }

            function makeEngineMove() {
                var elo = $('#elo').val();
                $status.text("Engine thinking...");

                // Capture state before the user's move for logging
                var fenBeforeUser = fenHistory.length >= 2 ? fenHistory[fenHistory.length - 2] : '';
                if (fenBeforeUser === 'start') fenBeforeUser = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
                var history = game.history();
                var lastMoveSan = history.length > 0 ? history[history.length - 1] : '';
                var lastMoveUci = '';
                // Get UCI from the game's internal move list
                var moves = game.history({verbose: true});
                if (moves.length > 0) {
                    var m = moves[moves.length - 1];
                    lastMoveUci = m.from + m.to + (m.promotion || '');
                }

                moveNumber++;

                var timeRem = ($('#timeControl').val() === 'none') ? null : playerTimeRemaining;

                $.ajax({
                    url: '/move',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        fen: game.fen(),
                        elo: parseInt(elo),
                        game_id: gameId,
                        move_number: moveNumber,
                        user_move_san: lastMoveSan,
                        user_move_uci: lastMoveUci,
                        fen_before_user: fenBeforeUser,
                        time_remaining: timeRem
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
                            stopPlayerTimer();
                            // Determine result and log end game
                            var result = 'draw';
                            if (game.in_checkmate()) {
                                result = (game.turn() === playerColor.charAt(0)) ? 'loss' : 'win';
                            }
                            endGameOnServer(result);
                        } else {
                            // Start player timer for their next move
                            startPlayerTimer();
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

                // Disable if not player's turn (engine thinking in CPU mode)
                if (gameMode === 'cpu' && game.turn() !== playerColor.charAt(0)) return;

                if (selectedSquare === null) {
                    // Select piece
                    var piece = game.get(square);
                    var allowedColor = (gameMode === 'pvp') ? game.turn() : playerColor.charAt(0);
                    if (piece && piece.color === allowedColor) {
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
                            var allowedColor = (gameMode === 'pvp') ? game.turn() : playerColor.charAt(0);
                            if (piece && piece.color === allowedColor) {
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
                    var fenBeforePromo = pendingPromotion.fenBefore || game.fen();
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
                        moveNumber++;
                        
                        // Stop timer and add increment
                        stopPlayerTimer();
                        addPlayerIncrement();
                        
                        updateStatus();

                        if (gameMode === 'pvp') {
                            logPvpMove(move, fenBeforePromo);
                            if (!game.game_over()) {
                                switchTimer();
                            } else {
                                var result = 'draw';
                                if (game.in_checkmate()) {
                                    result = (move.color === 'w') ? 'white_wins' : 'black_wins';
                                }
                                endGameOnServer(result);
                            }
                        } else {
                            if (!game.game_over()) {
                                makeEngineMove();
                            } else {
                                stopPlayerTimer();
                                var result = 'draw';
                                if (game.in_checkmate()) {
                                    result = 'win';
                                }
                                endGameOnServer(result);
                            }
                        }
                    }
                    pendingPromotion = null;
                }
            });

            // Event Listeners
            $('#startBtn').on('click', function () {
                gameMode = $('input[name="gameMode"]:checked').val() || 'cpu';
                playerColor = $('input[name="playerColor"]:checked').val();
                game.reset();
                board.start();
                gameResigned = false;
                fenHistory = ['start'];
                evalHistory = [null];
                currentMoveIndex = 0;
                moveNumber = 0;
                activeTimerSide = 'w';
                $evaluation.text("-");

                // Close analysis if open
                analysisMode = false;
                analysisData = null;
                currentAnalysisPly = 0;
                $('#analysis-panel').hide();
                $('#eval-bar').hide();
                $('#settings-card').show();
                $('#analyzeBtn').hide();

                // Show/hide hint button based on mode
                if (gameMode === 'pvp') {
                    $('#hintBtn').hide();
                } else {
                    $('#hintBtn').show();
                }

                // Save and initialize timer
                saveTimeControl();
                stopPlayerTimer();
                initializeTimer();

                // Gather age data
                var playerAge = $('#playerAge').val() || '';
                var player2Age = (gameMode === 'pvp') ? ($('#player2Age').val() || '') : '';

                // Register new game on server
                var elo = (gameMode === 'cpu') ? $('#elo').val() : 0;
                $.ajax({
                    url: '/new_game',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        elo: parseInt(elo),
                        player_color: playerColor,
                        game_mode: gameMode,
                        player_age: playerAge,
                        player2_age: player2Age
                    }),
                    success: function (response) {
                        gameId = response.game_id;
                        console.log('New game started, id:', gameId, 'mode:', gameMode);
                    }
                });

                if (gameMode === 'pvp') {
                    // PvP: always show white's perspective, start white's timer
                    board.orientation('white');
                    startPlayerTimer();
                } else {
                    // CPU mode
                    if (playerColor === 'black') {
                        board.orientation('black');
                        setTimeout(function () {
                            makeEngineMove();
                        }, 500);
                    } else {
                        board.orientation('white');
                        startPlayerTimer();
                    }
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
                stopPlayerTimer();
                gameResigned = true;
                if (gameMode === 'pvp') {
                    var loser = (game.turn() === 'w') ? 'White (SSSUP)' : 'Black (SNS)';
                    var winner = (game.turn() === 'w') ? 'Black (SNS)' : 'White (SSSUP)';
                    $('#status').text(winner + ' wins by resignation');
                    var result = (game.turn() === 'w') ? 'white_resigns' : 'black_resigns';
                    endGameOnServer(result);
                } else {
                    var winner = playerColor === 'white' ? 'Black' : 'White';
                    $('#status').text(winner + ' wins by resignation');
                    endGameOnServer('resign');
                }
            });

            $('#cancelResignBtn').on('click', function () {
                $('#resign-modal').fadeOut();
            });

            $('#flipBtn').on('click', function () {
                board.flip();
            });

            // Game Mode Toggle
            $('input[name="gameMode"]').on('change', function () {
                var mode = $(this).val();
                if (mode === 'pvp') {
                    $('#elo-section').slideUp(200);
                    $('#player2-age-section').slideDown(200);
                } else {
                    $('#elo-section').slideDown(200);
                    $('#player2-age-section').slideUp(200);
                }
            });

            // Hint Button
            var hintHighlightTimeout = null;
            function removeHintHighlights() {
                $('#board .square-55d63').removeClass('highlight-hint');
            }
            $('#hintBtn').on('click', function () {
                // Only allow hint when it's the player's turn, game is active, and at current position
                if (game.game_over() || gameResigned) return;
                if (game.turn() !== playerColor.charAt(0)) return;
                if (currentMoveIndex !== fenHistory.length - 1) return;

                var $btn = $(this);
                $btn.prop('disabled', true).text('Thinking...');

                $.ajax({
                    url: '/hint',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        fen: game.fen(),
                        game_id: gameId,
                        move_number: moveNumber + 1
                    }),
                    success: function (response) {
                        $btn.prop('disabled', false).text('\ud83d\udca1 Hint');
                        removeHintHighlights();

                        // Highlight source and target squares
                        var $from = $('#board .square-' + response.from);
                        var $to = $('#board .square-' + response.to);
                        $from.addClass('highlight-hint');
                        $to.addClass('highlight-hint');

                        // Remove highlight after 4 seconds
                        if (hintHighlightTimeout) clearTimeout(hintHighlightTimeout);
                        hintHighlightTimeout = setTimeout(removeHintHighlights, 4000);
                    },
                    error: function () {
                        $btn.prop('disabled', false).text('\ud83d\udca1 Hint');
                        console.error('Hint request failed');
                    }
                });
            });

            // === Analysis Functions ===
            function showAnalysis() {
                analysisMode = true;
                currentAnalysisPly = 0;
                $('#settings-card').hide();
                $('#analysis-panel').show();
                $('#eval-bar').show();

                var s = analysisData.summary;
                var summaryHtml = '<div class="accuracy-display">' +
                    '<div class="accuracy-value">' + s.accuracy + '%</div>' +
                    '<div class="accuracy-label">Accuracy</div>' +
                    '</div>' +
                    '<div class="classification-counts">' +
                    (s.best > 0 ? '<span class="cl-badge cl-best">' + s.best + ' Best</span>' : '') +
                    (s.excellent > 0 ? '<span class="cl-badge cl-excellent">' + s.excellent + ' Excellent</span>' : '') +
                    (s.good > 0 ? '<span class="cl-badge cl-good">' + s.good + ' Good</span>' : '') +
                    (s.inaccuracy > 0 ? '<span class="cl-badge cl-inaccuracy">' + s.inaccuracy + ' Inaccuracy</span>' : '') +
                    (s.mistake > 0 ? '<span class="cl-badge cl-mistake">' + s.mistake + ' Mistake</span>' : '') +
                    (s.blunder > 0 ? '<span class="cl-badge cl-blunder">' + s.blunder + ' Blunder</span>' : '') +
                    '</div>' +
                    '<div class="avg-cp-loss">Avg CP Loss: ' + s.avg_cp_loss + '</div>';
                $('#analysis-summary').html(summaryHtml);

                var movesHtml = '';
                for (var idx = 0; idx < analysisData.moves.length; idx++) {
                    var m = analysisData.moves[idx];
                    var moveNum = Math.ceil(m.ply / 2);
                    var isWhite = (m.ply % 2 === 1);
                    var prefix = isWhite ? moveNum + '. ' : '';
                    var badgeHtml = '';
                    var rowClass = '';
                    if (m.is_user && m.classification) {
                        rowClass = ' cl-row-' + m.classification;
                        badgeHtml = '<span class="cl-badge cl-' + m.classification + '">' +
                            m.classification.charAt(0).toUpperCase() + m.classification.slice(1) +
                            '</span>';
                        if (m.classification !== 'best' && m.classification !== 'excellent' && m.best_move_san) {
                            badgeHtml += '<span class="best-alt">Best: ' + m.best_move_san + '</span>';
                        }
                    }
                    movesHtml += '<div class="analysis-move' + rowClass + '" data-ply="' + m.ply + '">' +
                        '<span class="move-prefix">' + prefix + '</span>' +
                        '<span class="move-san">' + m.move_san + '</span>' +
                        badgeHtml +
                        '</div>';
                }
                $('#analysis-moves').html(movesHtml);
                navigateToAnalysisPly(0);
            }

            function navigateToAnalysisPly(ply) {
                currentAnalysisPly = ply;
                if (ply === 0) {
                    board.position('start');
                    updateEvalBar(analysisData.start_eval || 30);
                } else if (ply <= analysisData.moves.length) {
                    var moveData = analysisData.moves[ply - 1];
                    if (moveData.fen_after) {
                        board.position(moveData.fen_after);
                    }
                    if (typeof moveData.eval_after === 'number') {
                        updateEvalBar(moveData.eval_after);
                    }
                }
                $('.analysis-move').removeClass('analysis-move-active');
                if (ply > 0) {
                    var $active = $('.analysis-move[data-ply="' + ply + '"]');
                    $active.addClass('analysis-move-active');
                    if ($active.length) {
                        var container = $('#analysis-moves')[0];
                        var el = $active[0];
                        if (el.offsetTop < container.scrollTop ||
                            el.offsetTop + el.offsetHeight > container.scrollTop + container.clientHeight) {
                            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
                        }
                    }
                }
            }

            function updateEvalBar(evalCp) {
                var pct = 50 + 50 * (2 / (1 + Math.exp(-evalCp / 250)) - 1);
                pct = Math.max(2, Math.min(98, pct));
                $('#eval-bar-fill').css('height', pct + '%');
                var label;
                if (Math.abs(evalCp) >= 9000) {
                    label = evalCp > 0 ? '#' : '-#';
                } else {
                    label = (evalCp >= 0 ? '+' : '') + (evalCp / 100).toFixed(1);
                }
                $('#eval-bar-label').text(label);
            }

            // Analyze button
            $('#analyzeBtn').on('click', function () {
                var $btn = $(this);
                $btn.prop('disabled', true).text('Analyzing...');
                var moves = game.history({ verbose: true });
                var movesUci = [];
                for (var mi = 0; mi < moves.length; mi++) {
                    var mv = moves[mi];
                    movesUci.push(mv.from + mv.to + (mv.promotion || ''));
                }
                $.ajax({
                    url: '/analyze_game',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        moves: movesUci,
                        player_color: playerColor
                    }),
                    success: function (response) {
                        $btn.prop('disabled', false).text('Analyze');
                        analysisData = response;
                        showAnalysis();
                    },
                    error: function () {
                        $btn.prop('disabled', false).text('Analyze');
                        console.error('Analysis failed');
                    }
                });
            });

            // Close analysis
            $('#closeAnalysisBtn').on('click', function () {
                analysisMode = false;
                $('#analysis-panel').hide();
                $('#eval-bar').hide();
                $('#settings-card').show();
                currentMoveIndex = fenHistory.length - 1;
                var pos = fenHistory[currentMoveIndex];
                board.position(pos === 'start' ? 'start' : pos);
            });

            // Click analysis move to navigate
            $('#analysis-moves').on('click', '.analysis-move', function () {
                var ply = parseInt($(this).data('ply'));
                navigateToAnalysisPly(ply);
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

                // Restart timer for player's turn (time remains unchanged)
                startPlayerTimer();

                updateStatus();
            });

            $(window).resize(function () {
                if (board) board.resize();
            });

            // History Navigation
            $('#prevBtn').on('click', function () {
                if (analysisMode) {
                    if (currentAnalysisPly > 0) {
                        currentAnalysisPly--;
                        navigateToAnalysisPly(currentAnalysisPly);
                    }
                    return;
                }
                stopPlayerTimer(); // Stop timer during history navigation
                
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
                if (analysisMode) {
                    if (analysisData && currentAnalysisPly < analysisData.moves.length) {
                        currentAnalysisPly++;
                        navigateToAnalysisPly(currentAnalysisPly);
                    }
                    return;
                }
                if (currentMoveIndex < fenHistory.length - 1) {
                    currentMoveIndex++;
                    currentMoveIndex++; // Jump fwd 2
                    if (currentMoveIndex >= fenHistory.length) currentMoveIndex = fenHistory.length - 1; // Safety

                    board.position(fenHistory[currentMoveIndex]);
                    var evalText = evalHistory[currentMoveIndex] !== null ? evalHistory[currentMoveIndex] : "-";
                    $evaluation.text(evalText);
                }
                
                // If returned to latest position and it's player's turn, restart timer
                if (currentMoveIndex === fenHistory.length - 1 && 
                    !game.game_over() && 
                    game.turn() === playerColor.charAt(0)) {
                    startPlayerTimer();
                }
            });

        } catch (e) {
            console.error("Critical Error in initGame:", e);
            $('#status').text("Error initializing game: " + e.message);
        }
    }
});
