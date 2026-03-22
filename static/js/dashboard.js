$(function () {
    $.getJSON('/api/dashboard', function (data) {
        $('#dashboard-loading').hide();

        if (data.summary.total_games === 0) {
            $('#empty-state').show();
            $('#dashboard').show();
            return;
        }

        renderSummary(data.summary);
        renderResultsChart(data.summary.results_distribution);
        renderEloResultTable(data.elo_vs_result);
        renderOpenings(data.opening_sequences);
        renderDFG(data.dfg_opening_img);
        renderErrorPhase(data.error_by_phase);
        renderErrorElo(data.error_rate_by_elo);
        renderWorstMoves(data.worst_moves);
        renderHintAnalysis(data.hint_analysis);
        $('#dashboard').show();
    }).fail(function () {
        $('#dashboard-loading').html('<p>Errore nel caricamento. Controlla che ci siano dati di partite disponibili.</p>');
    });

    function renderSummary(s) {
        $('#stat-games').text(s.total_games);
        $('#stat-completed').text(s.completed_games);
        $('#stat-moves').text(s.total_moves);
        $('#stat-hints').text(s.total_hints);
        $('#stat-avg-moves').text(s.avg_moves_per_game);
        // Show CPU/PvP breakdown if available
        if (s.cpu_games || s.pvp_games) {
            var extra = '(CPU: ' + (s.cpu_games || 0) + ' | PvP: ' + (s.pvp_games || 0) + ')';
            $('#stat-games').append('<div class="stat-sub">' + extra + '</div>');
        }
    }

    function renderResultsChart(dist) {
        if (!dist || Object.keys(dist).length === 0) return;
        var max = Math.max.apply(null, Object.values(dist));
        var html = '';
        var order = ['win', 'loss', 'draw', 'resign', 'timeout', 'abandoned'];
        var labels = {
            win: 'Vittorie', loss: 'Sconfitte', draw: 'Patte',
            resign: 'Abbandoni', timeout: 'Timeout', abandoned: 'Interrotte'
        };
        for (var i = 0; i < order.length; i++) {
            var key = order[i];
            var count = dist[key] || 0;
            if (count === 0) continue;
            var height = max > 0 ? Math.max(4, (count / max) * 140) : 4;
            html += '<div class="bar-item">';
            html += '<div class="bar-count">' + count + '</div>';
            html += '<div class="bar-fill bar-' + key + '" style="height:' + height + 'px"></div>';
            html += '<div class="bar-label">' + (labels[key] || key) + '</div>';
            html += '</div>';
        }
        $('#results-chart').html(html);
    }

    function renderEloResultTable(eloData) {
        if (!eloData || Object.keys(eloData).length === 0) return;
        var tbody = '';
        var elos = Object.keys(eloData).sort(function (a, b) { return a - b; });
        for (var i = 0; i < elos.length; i++) {
            var elo = elos[i];
            var d = eloData[elo];
            var wr = (d.win_rate * 100).toFixed(1) + '%';
            var wrClass = d.win_rate >= 0.5 ? 'win-rate-high' : (d.win_rate >= 0.3 ? 'win-rate-mid' : 'win-rate-low');
            tbody += '<tr>';
            tbody += '<td><strong>' + elo + '</strong></td>';
            tbody += '<td>' + d.total + '</td>';
            tbody += '<td>' + d.win + '</td>';
            tbody += '<td>' + d.loss + '</td>';
            tbody += '<td>' + d.draw + '</td>';
            tbody += '<td class="win-rate ' + wrClass + '">' + wr + '</td>';
            tbody += '</tr>';
        }
        $('#elo-result-table tbody').html(tbody);
    }

    function renderOpenings(openings) {
        if (!openings || openings.length === 0) {
            $('#openings-list').html('<p style="color:var(--text-secondary)">Non ci sono ancora abbastanza partite.</p>');
            return;
        }
        var html = '';
        for (var i = 0; i < openings.length; i++) {
            var seq = openings[i][0];
            var count = openings[i][1];
            html += '<div class="opening-item">';
            html += '<span class="opening-moves">' + escapeHtml(seq) + '</span>';
            html += '<span class="opening-count">' + count + 'x</span>';
            html += '</div>';
        }
        $('#openings-list').html(html);
    }

    function renderDFG(imgBase64) {
        if (!imgBase64) return;
        $('#dfg-img').attr('src', 'data:image/png;base64,' + imgBase64);
        $('#dfg-section').show();
    }

    function renderErrorPhase(errorData) {
        if (!errorData || Object.keys(errorData).length === 0) return;
        var phases = ['opening', 'middlegame', 'endgame'];
        var phaseLabels = { opening: 'Apertura', middlegame: 'Mediogioco', endgame: 'Finale' };
        var tbody = '';
        for (var i = 0; i < phases.length; i++) {
            var p = phases[i];
            var d = errorData[p] || { inaccuracy: 0, mistake: 0, blunder: 0, total: 0 };
            tbody += '<tr>';
            tbody += '<td><span class="phase-tag phase-' + p + '">' + phaseLabels[p] + '</span></td>';
            tbody += '<td>' + d.inaccuracy + '</td>';
            tbody += '<td>' + d.mistake + '</td>';
            tbody += '<td>' + d.blunder + '</td>';
            tbody += '<td><strong>' + d.total + '</strong></td>';
            tbody += '</tr>';
        }
        $('#error-phase-table tbody').html(tbody);
    }

    function renderErrorElo(errorElo) {
        if (!errorElo || Object.keys(errorElo).length === 0) return;
        var elos = Object.keys(errorElo).sort(function (a, b) { return a - b; });
        var tbody = '';
        for (var i = 0; i < elos.length; i++) {
            var elo = elos[i];
            var d = errorElo[elo];
            var rate = (d.error_rate * 100).toFixed(1) + '%';
            var rateClass = d.error_rate >= 0.3 ? 'win-rate-low' : (d.error_rate >= 0.15 ? 'win-rate-mid' : 'win-rate-high');
            tbody += '<tr>';
            tbody += '<td><strong>' + elo + '</strong></td>';
            tbody += '<td>' + d.total_moves + '</td>';
            tbody += '<td>' + d.errors + '</td>';
            tbody += '<td class="' + rateClass + '">' + rate + '</td>';
            tbody += '</tr>';
        }
        $('#error-elo-table tbody').html(tbody);
    }

    function renderWorstMoves(moves) {
        if (!moves || moves.length === 0) return;
        var tbody = '';
        for (var i = 0; i < moves.length; i++) {
            var m = moves[i];
            var phaseClass = 'phase-' + m.phase;
            var phaseLabel = { opening: 'Apertura', middlegame: 'Mediogioco', endgame: 'Finale' }[m.phase] || m.phase;
            tbody += '<tr>';
            tbody += '<td>' + m.move_number + '</td>';
            tbody += '<td><strong>' + escapeHtml(m.move_san) + '</strong></td>';
            tbody += '<td>' + Math.round(m.cp_loss) + '</td>';
            tbody += '<td><span class="phase-tag ' + phaseClass + '">' + phaseLabel + '</span></td>';
            tbody += '</tr>';
        }
        $('#worst-moves-table tbody').html(tbody);
    }

    function renderHintAnalysis(hintData) {
        if (!hintData || Object.keys(hintData).length === 0) {
            $('#hint-analysis').html('<p style="color:var(--text-secondary)">Nessun dato sui suggerimenti disponibile.</p>');
            return;
        }
        var html = '';

        // With hints card
        var wh = hintData.with_hints || {};
        html += '<div class="hint-card">';
        html += '<h4>🟢 Partite con suggerimenti</h4>';
        html += '<div class="comparisons">';
        html += '<div class="comp-row"><span>Partite</span><span>' + (wh.games || 0) + '</span></div>';
        html += '<div class="comp-row"><span>Win rate</span><span>' + ((wh.win_rate || 0) * 100).toFixed(1) + '%</span></div>';
        html += '<div class="comp-row"><span>Media mosse</span><span>' + (wh.avg_moves || 0) + '</span></div>';
        html += '</div></div>';

        // Without hints card
        var woh = hintData.without_hints || {};
        html += '<div class="hint-card">';
        html += '<h4>⚪ Partite senza suggerimenti</h4>';
        html += '<div class="comparisons">';
        html += '<div class="comp-row"><span>Partite</span><span>' + (woh.games || 0) + '</span></div>';
        html += '<div class="comp-row"><span>Win rate</span><span>' + ((woh.win_rate || 0) * 100).toFixed(1) + '%</span></div>';
        html += '<div class="comp-row"><span>Media mosse</span><span>' + (woh.avg_moves || 0) + '</span></div>';
        html += '</div></div>';

        // General hint stats
        if (hintData.avg_hints_per_game !== undefined) {
            html += '<div class="hint-card">';
            html += '<h4>📊 Statistiche suggerimenti</h4>';
            html += '<div class="comparisons">';
            html += '<div class="comp-row"><span>Media per partita</span><span>' + hintData.avg_hints_per_game + '</span></div>';
            html += '<div class="comp-row"><span>Max in una partita</span><span>' + (hintData.max_hints_in_game || 0) + '</span></div>';
            html += '</div></div>';
        }

        $('#hint-analysis').html(html);
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    }
});
