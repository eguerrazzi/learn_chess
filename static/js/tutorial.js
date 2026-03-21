$(document).ready(function () {
    var lessons = [];
    var currentLesson = null;
    var currentStepIndex = 0;
    var board = null;
    var game = null;
    var completedLessons = JSON.parse(localStorage.getItem('completedLessons') || '[]');

    // Load lessons data
    $.getJSON('/static/tutorials/lessons.json', function (data) {
        lessons = data;
        renderLessonList();
    });

    function renderLessonList() {
        var html = '';
        for (var i = 0; i < lessons.length; i++) {
            var lesson = lessons[i];
            var isCompleted = completedLessons.indexOf(lesson.id) !== -1;
            // Accessible if first, or previous lesson completed
            var isLocked = (i > 0 && completedLessons.indexOf(lessons[i - 1].id) === -1);
            var statusClass = isCompleted ? 'lesson-completed' : (isLocked ? 'lesson-locked' : '');
            var activeClass = (currentLesson && currentLesson.id === lesson.id) ? ' lesson-active' : '';
            var statusIcon = isCompleted ? '✅' : (isLocked ? '🔒' : '');

            html += '<div class="lesson-item ' + statusClass + activeClass + '" data-index="' + i + '">' +
                '<span class="lesson-icon">' + lesson.icon + '</span>' +
                '<span class="lesson-name">' + lesson.title + '</span>' +
                '<span class="lesson-status">' + statusIcon + '</span>' +
                '</div>';
        }
        $('#lesson-list').html(html);
    }

    // Click on a lesson
    $('#lesson-list').on('click', '.lesson-item', function () {
        var index = parseInt($(this).data('index'));
        // Check if locked
        if (index > 0 && completedLessons.indexOf(lessons[index - 1].id) === -1) {
            return; // Locked
        }
        startLesson(index);
    });

    function startLesson(index) {
        currentLesson = lessons[index];
        currentStepIndex = 0;
        $('#welcome-panel').hide();
        $('#lesson-area').show();
        $('#lesson-title').text(currentLesson.icon + ' ' + currentLesson.title);
        $('#step-total').text(currentLesson.steps.length);

        renderLessonList();
        loadStep();
    }

    function loadStep() {
        var step = currentLesson.steps[currentStepIndex];
        $('#step-current').text(currentStepIndex + 1);
        $('#step-feedback').html('').removeClass('feedback-success feedback-error');

        // Progress bar
        var pct = ((currentStepIndex) / currentLesson.steps.length) * 100;
        $('#progress-bar').css('width', pct + '%');

        // Nav buttons
        $('#prevStepBtn').prop('disabled', currentStepIndex === 0);
        if (step.type === 'exercise') {
            $('#nextStepBtn').text('Salta →').removeClass('primary').addClass('secondary');
        } else {
            $('#nextStepBtn').text('Avanti →').removeClass('secondary').addClass('primary');
        }

        // Destroy previous board
        if (board) {
            board.destroy();
            board = null;
        }

        var orientation = step.orientation || 'white';

        if (step.type === 'demo') {
            // Demo step: static board with highlights
            $('#step-text').html('<p>' + step.text + '</p>');
            board = Chessboard('tutorial-board', {
                position: step.fen,
                draggable: false,
                orientation: orientation,
                pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
            });

            // Highlight squares
            if (step.highlights) {
                setTimeout(function () {
                    for (var h = 0; h < step.highlights.length; h++) {
                        var sq = step.highlights[h];
                        $('#tutorial-board .square-' + sq).addClass('highlight-tutorial');
                    }
                }, 100);
            }

        } else if (step.type === 'exercise') {
            // Exercise step: draggable board, validate move
            $('#step-text').html('<p>🎯 <strong>Esercizio:</strong> ' + step.text + '</p>');
            game = new Chess(step.fen);

            board = Chessboard('tutorial-board', {
                position: step.fen,
                draggable: true,
                orientation: orientation,
                pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
                onDrop: handleExerciseDrop,
                onSnapEnd: function () {
                    if (board) board.position(game.fen());
                }
            });
        }

        // Resize after render
        setTimeout(function () {
            if (board) board.resize();
        }, 200);
    }

    function handleExerciseDrop(source, target) {
        var step = currentLesson.steps[currentStepIndex];
        var expectedUci = step.correctMove;
        // Try with promotion if expected move has one
        var promotion = expectedUci.length > 4 ? expectedUci[4] : undefined;

        var moveObj = game.move({
            from: source,
            to: target,
            promotion: promotion || 'q'
        });

        if (moveObj === null) {
            return 'snapback';
        }

        var actualUci = source + target + (moveObj.promotion || '');

        if (actualUci === expectedUci) {
            // Correct!
            $('#step-feedback').html('✅ Corretto! Ottimo lavoro!')
                .removeClass('feedback-error').addClass('feedback-success');
            $('#nextStepBtn').text('Avanti →').removeClass('secondary').addClass('primary');
        } else {
            // Wrong move (but legal)
            game.undo();
            $('#step-feedback').html('❌ Non è la mossa giusta. Riprova!')
                .removeClass('feedback-success').addClass('feedback-error');
            return 'snapback';
        }
    }

    // Click-click for exercises on mobile
    var selectedSquare = null;
    $('#lesson-area').on('click', '#tutorial-board .square-55d63', function () {
        var step = currentLesson.steps[currentStepIndex];
        if (step.type !== 'exercise' || !game) return;

        var square = $(this).data('square');

        if (selectedSquare === null) {
            var piece = game.get(square);
            if (piece && piece.color === game.turn()) {
                selectedSquare = square;
                removeExerciseHighlights();
                $('#tutorial-board .square-' + square).addClass('highlight-selected');
            }
        } else {
            if (square === selectedSquare) {
                selectedSquare = null;
                removeExerciseHighlights();
                return;
            }
            var result = handleExerciseDrop(selectedSquare, square);
            if (result !== 'snapback') {
                board.position(game.fen());
            }
            selectedSquare = null;
            removeExerciseHighlights();
        }
    });

    function removeExerciseHighlights() {
        $('#tutorial-board .square-55d63').removeClass('highlight-selected');
    }

    // Navigation buttons
    $('#nextStepBtn').on('click', function () {
        if (currentStepIndex < currentLesson.steps.length - 1) {
            currentStepIndex++;
            loadStep();
        } else {
            // Lesson complete!
            completeLesson();
        }
    });

    $('#prevStepBtn').on('click', function () {
        if (currentStepIndex > 0) {
            currentStepIndex--;
            loadStep();
        }
    });

    function completeLesson() {
        if (completedLessons.indexOf(currentLesson.id) === -1) {
            completedLessons.push(currentLesson.id);
            localStorage.setItem('completedLessons', JSON.stringify(completedLessons));
        }

        // Update progress bar to 100%
        $('#progress-bar').css('width', '100%');

        $('#step-text').html(
            '<div class="lesson-complete">' +
            '<h3>🎉 Lezione completata!</h3>' +
            '<p>' + currentLesson.title + ' — completato con successo.</p>' +
            '</div>'
        );
        $('#step-feedback').html('');

        // Check if there's a next lesson
        var lessonIdx = lessons.indexOf(currentLesson);
        if (lessonIdx < lessons.length - 1) {
            $('#nextStepBtn').text('Prossima lezione →').removeClass('secondary').addClass('primary');
            $('#nextStepBtn').off('click').on('click', function () {
                restoreNextHandler();
                startLesson(lessonIdx + 1);
            });
        } else {
            $('#nextStepBtn').text('Tutte le lezioni completate!').prop('disabled', true);
        }

        // Destroy board
        if (board) {
            board.destroy();
            board = null;
        }

        renderLessonList();
    }

    function restoreNextHandler() {
        $('#nextStepBtn').off('click').on('click', function () {
            if (currentStepIndex < currentLesson.steps.length - 1) {
                currentStepIndex++;
                loadStep();
            } else {
                completeLesson();
            }
        });
    }

    // Window resize
    $(window).resize(function () {
        if (board) board.resize();
    });
});
