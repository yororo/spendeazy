$ErrorActionPreference = 'Stop'
$draftDirectory = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $draftDirectory 'manifest.json') -Raw | ConvertFrom-Json
$publicationPath = Join-Path $draftDirectory 'publication.json'
$published = @{}
if (Test-Path -LiteralPath $publicationPath) {
    $priorPublication = Get-Content -LiteralPath $publicationPath -Raw | ConvertFrom-Json
    foreach ($entry in $priorPublication.tickets) { $published[[int]$entry.id] = $entry }
}
function Save-Publication {
    $entries = @($published.Values | Sort-Object id)
    @{ parent = $manifest.parent; repo = $manifest.repo; status = 'issues-created-dependencies-pending'; tickets = $entries } |
        ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $publicationPath -Encoding utf8
}
foreach ($ticket in $manifest.tickets) {
    $draftId = [int]$ticket.id
    if ($published.ContainsKey($draftId)) { continue }
    $blockerLines = @()
    foreach ($blocker in $ticket.blockers) {
        if (-not $published.ContainsKey([int]$blocker)) { throw "Missing published blocker $blocker" }
        $blockerLines += '- ' + $published[[int]$blocker].url
    }
    if ($blockerLines.Count -eq 0) { $blockerLines = @('None — can start immediately.') }
    $criteria = ($ticket.criteria | ForEach-Object { '- [ ] ' + $_ }) -join "`n"
    $body = @"
## Parent

https://github.com/$($manifest.repo)/issues/$($manifest.parent)

## What to build

$($ticket.deliverable)

Scope: parent User Stories $($ticket.stories); $($ticket.decisions).

## Acceptance criteria

$criteria

## Blocked by

$($blockerLines -join "`n")

## Implementation and validation guardrails

$($manifest.sharedGuidance)
"@
    $bodyPath = Join-Path $draftDirectory ('{0:D2}.md' -f $draftId)
    $body | Set-Content -LiteralPath $bodyPath -Encoding utf8
    $issueUrl = & gh issue create --repo $manifest.repo --title $ticket.title --label ready-for-agent --body-file $bodyPath
    if ($LASTEXITCODE -ne 0) { throw "Issue creation failed for ticket $draftId" }
    $issueUrl = ($issueUrl | Out-String).Trim()
    if ($issueUrl -notmatch '/issues/(\d+)$') { throw "Unexpected issue URL: $issueUrl" }
    $published[$draftId] = [pscustomobject]@{ id = $draftId; number = [int]$Matches[1]; title = $ticket.title; url = $issueUrl; blockers = @($ticket.blockers) }
    Save-Publication
    Write-Output "Created ticket $draftId : $issueUrl"
}
Write-Output 'All approved implementation issues have been created.'
