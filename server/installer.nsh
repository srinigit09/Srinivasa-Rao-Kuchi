!macro customInstall
  DetailPrint "Configuring Windows Firewall rules for Panic Alarm Server..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Server" dir=in action=allow program="$INSTDIR\PanicAlarmServer.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Server Port" dir=in action=allow protocol=TCP localport=5000 enable=yes profile=any'

  ; Shared data folder (database, port, install marker): every Windows user on this PC must be able
  ; to read AND write it so the server behaves identically whichever user is logged in.
  ; (*S-1-5-32-545 = BUILTIN\Users, Modify, inherited by files created later).
  DetailPrint "Creating shared data folder for all Windows users..."
  SetShellVarContext all   ; $APPDATA = C:\ProgramData
  CreateDirectory "$APPDATA\PanicAlarmServer"
  nsExec::Exec 'icacls "$APPDATA\PanicAlarmServer" /grant *S-1-5-32-545:(OI)(CI)M /T /C'

  ; Start the server automatically for EVERY user who logs in (machine-wide Run key).
  SetRegView 64
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "PanicAlarmServer" '"$INSTDIR\PanicAlarmServer.exe"'

  ; Watchdog: every minute, for whichever user is logged in, restart PanicAlarmServer if it is not running
  ; (crash / killed). Not restarted after a deliberate, confirmed Quit.
  nsExec::Exec 'schtasks /Create /TN "PanicAlarmServerWatchdog" /TR "wscript.exe //B //Nologo \"$INSTDIR\resources\watchdog.vbs\"" /SC MINUTE /MO 1 /RU "BUILTIN\Users" /IT /RL LIMITED /F'
!macroend

; Runs early in the uninstaller: remove the watchdog and autostart FIRST so nothing can restart the
; server, then stop every running copy (all logged-in Windows users) before the files are deleted.
!macro customUnInit
  nsExec::Exec 'schtasks /Delete /TN "PanicAlarmServerWatchdog" /F'
  SetRegView 64
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "PanicAlarmServer"
  nsExec::Exec 'taskkill /F /IM "PanicAlarmServer.exe"'
!macroend

!macro customUnInstall
  nsExec::Exec 'schtasks /Delete /TN "PanicAlarmServerWatchdog" /F'
  nsExec::Exec 'taskkill /F /IM "PanicAlarmServer.exe"'
  DetailPrint "Removing Windows Firewall rules for Panic Alarm Server..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Server"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Server Port"'
  SetRegView 64
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "PanicAlarmServer"

  ; A real uninstall (NOT an upgrade, which passes --updated) removes ALL data — database, license,
  ; port, logs, install marker (shared folder) and every Windows user's own settings — so a later
  ; install is a clean first install. Restore a database from your own backup if you need it.
  ${ifNot} ${isUpdated}
    DetailPrint "Removing all Panic Alarm Server data..."
    ReadEnvStr $0 ProgramData
    ${If} $0 != ""
      RMDir /r "$0\PanicAlarmServer"
    ${EndIf}
    nsExec::Exec `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath (Join-Path $$env:SystemDrive 'Users') -Directory -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath (Join-Path $$_.FullName 'AppData\Roaming\panic-alarm-server'),(Join-Path $$_.FullName 'AppData\Local\PanicAlarm\server-stopped.flag') -Recurse -Force -ErrorAction SilentlyContinue }"`
  ${endIf}
!macroend
