# 매일 아침 08:00 자동 조회를 Windows 작업 스케줄러에 등록합니다.
# 사용법(관리자 권한 PowerShell 권장):
#   powershell -ExecutionPolicy Bypass -File .\schedule-windows.ps1
# 해제:
#   Unregister-ScheduledTask -TaskName "AssemblySeminarRadar" -Confirm:$false

$ErrorActionPreference = "Stop"

$taskName = "AssemblySeminarRadar"
$projectDir = $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node 를 찾을 수 없습니다. Node.js 설치 후 다시 실행하세요." }

$action = New-ScheduledTaskAction -Execute $node `
  -Argument "fetch-daily.js" -WorkingDirectory $projectDir

$trigger = New-ScheduledTaskTrigger -Daily -At 8:00am

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
  -DontStopOnIdleEnd -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Description "국회 토론회 레이더 매일 08:00 자동 조회" -Force | Out-Null

Write-Host "등록 완료: '$taskName' (매일 08:00)"
Write-Host "작업 폴더: $projectDir"
Write-Host "수동 실행 테스트:  Start-ScheduledTask -TaskName $taskName"
