!macro customInstall
  DetailPrint "Configuring Windows Firewall rules for Panic Alarm Client..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Client" dir=in action=allow program="$INSTDIR\PanicAlarmClient.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Client Outbound" dir=out action=allow program="$INSTDIR\PanicAlarmClient.exe" enable=yes profile=any'

  ; Shared settings folder: every Windows user on this PC must be able to read AND write it
  ; (*S-1-5-32-545 = BUILTIN\Users, Modify, inherited by files created later).
  DetailPrint "Creating shared settings folder for all Windows users..."
  SetShellVarContext all   ; $APPDATA = C:\ProgramData
  CreateDirectory "$APPDATA\PanicAlarmClient"
  nsExec::Exec 'icacls "$APPDATA\PanicAlarmClient" /grant *S-1-5-32-545:(OI)(CI)M /T /C'

  ; Start the client automatically for EVERY user who logs in (machine-wide Run key),
  ; not only for the user who ran the installer.
  SetRegView 64
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "PanicAlarmClient" '"$INSTDIR\PanicAlarmClient.exe"'

  ; Watchdog: every minute, for whichever user is logged in, restart PanicAlarmClient if it is not running
  ; (crash / killed). Not restarted after a deliberate, confirmed Quit.
  nsExec::Exec 'schtasks /Create /TN "PanicAlarmClientWatchdog" /TR "wscript.exe //B //Nologo \"$INSTDIR\resources\watchdog.vbs\"" /SC MINUTE /MO 1 /RU "BUILTIN\Users" /IT /RL LIMITED /F'
!macroend

; Runs early in the uninstaller: remove the watchdog and autostart FIRST so nothing can restart the
; client, then stop every running copy (all logged-in Windows users) before the files are deleted.
!macro customUnInit
  nsExec::Exec 'schtasks /Delete /TN "PanicAlarmClientWatchdog" /F'
  SetRegView 64
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "PanicAlarmClient"
  nsExec::Exec 'taskkill /F /IM "PanicAlarmClient.exe"'
!macroend

!macro customUnInstall
  nsExec::Exec 'schtasks /Delete /TN "PanicAlarmClientWatchdog" /F'
  nsExec::Exec 'taskkill /F /IM "PanicAlarmClient.exe"'
  DetailPrint "Removing Windows Firewall rules for Panic Alarm Client..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Client"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Client Outbound"'
  SetRegView 64
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "PanicAlarmClient"
!macroend
