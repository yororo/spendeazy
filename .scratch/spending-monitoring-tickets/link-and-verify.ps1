$ErrorActionPreference = 'Stop'
$publicationPath = Join-Path $PSScriptRoot 'publication.json'
$publication = Get-Content -LiteralPath $publicationPath -Raw | ConvertFrom-Json
$byDraftId = @{}
$databaseIds = @{}
foreach ($ticket in $publication.tickets) {
    $issue = & gh api "repos/$($publication.repo)/issues/$($ticket.number)" | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) { throw "Cannot read issue $($ticket.number)" }
    if ($issue.title -ne $ticket.title -or $issue.state -ne 'open') { throw "Unexpected issue metadata for $($ticket.number)" }
    if ('ready-for-agent' -notin $issue.labels.name) { throw "Missing label on issue $($ticket.number)" }
    $bodyPath = Join-Path $PSScriptRoot ('{0:D2}.md' -f [int]$ticket.id)
    $expectedBody = Get-Content -LiteralPath $bodyPath -Raw
    if ($issue.body.Replace("`r`n", "`n").Trim() -ne $expectedBody.Replace("`r`n", "`n").Trim()) { throw "Body mismatch on issue $($ticket.number)" }
    $byDraftId[[int]$ticket.id] = $ticket
    $databaseIds[[int]$ticket.id] = $issue.id
}
$edgeCount = 0
foreach ($ticket in $publication.tickets) {
    if ($ticket.blockers.Count -eq 0) { continue }
    $endpoint = "repos/$($publication.repo)/issues/$($ticket.number)/dependencies/blocked_by"
    $existing = @(& gh api $endpoint | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw "Cannot read dependencies for $($ticket.number)" }
    foreach ($blockerDraftId in $ticket.blockers) {
        $blocker = $byDraftId[[int]$blockerDraftId]
        if ($blocker.number -notin $existing.number) {
            & gh api --method POST $endpoint -F "issue_id=$($databaseIds[[int]$blockerDraftId])" --silent
            if ($LASTEXITCODE -ne 0) { throw "Cannot link $($ticket.number) blocked by $($blocker.number)" }
        }
        $edgeCount++
        Write-Output "#$($ticket.number) blocked by #$($blocker.number)"
    }
}
foreach ($ticket in $publication.tickets) {
    $actual = @(& gh api "repos/$($publication.repo)/issues/$($ticket.number)/dependencies/blocked_by" | ConvertFrom-Json)
    if ($LASTEXITCODE -ne 0) { throw "Cannot verify dependencies for $($ticket.number)" }
    $expectedNumbers = @($ticket.blockers | ForEach-Object { $byDraftId[[int]$_].number } | Sort-Object)
    $actualNumbers = @($actual.number | Where-Object { $null -ne $_ } | Sort-Object)
    if (($expectedNumbers -join ',') -ne ($actualNumbers -join ',')) { throw "Dependency mismatch for $($ticket.number)" }
}
$publication.status = 'published-and-verified'
$publication | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $publicationPath -Encoding utf8
$indexLines = @('# Implementation tickets for spec #75', '', 'Published and verified. All issues are open and labeled ready-for-agent. Native blocking links match the approved dependency graph. Parent #75 was not edited or closed.', '', '| Slice | Issue | Blocked by |', '| --- | --- | --- |')
foreach ($ticket in $publication.tickets) {
    $links = @($ticket.blockers | ForEach-Object { $b = $byDraftId[[int]$_]; '[#' + $b.number + '](' + $b.url + ')' })
    $blockerText = if ($links.Count -gt 0) { $links -join ', ' } else { 'None — can start immediately' }
    $indexLines += '| ' + $ticket.id + ' | [' + $ticket.title + '](' + $ticket.url + ') | ' + $blockerText + ' |'
}
$indexLines | Set-Content -LiteralPath (Join-Path $PSScriptRoot 'published-tickets.md') -Encoding utf8
Write-Output "Verified $($publication.tickets.Count) issues and $edgeCount native dependency links."
