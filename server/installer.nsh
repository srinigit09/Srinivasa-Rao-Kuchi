; ── Ciana Technologies branding ────────────────────────────────────────────────
; Bottom-left text of every installer / uninstaller page
!macro customHeader
  BrandingText "Ciana Technologies  |  Copyright 2026 by Ciana Tech Ltd."
!macroend

; Welcome page with the company logo (side bitmap = assets/installerSidebar.bmp)
!macro customWelcomePage
  !insertmacro skipPageIfUpdated
  !define MUI_WELCOMEPAGE_TITLE "Ciana Technologies"
  !define MUI_WELCOMEPAGE_TEXT "Welcome to the Panic Alarm Server setup.$\r$\n$\r$\nThis wizard installs Panic Alarm Server, part of the Panic Alarm clinic emergency alert system by Ciana Technologies.$\r$\n$\r$\nClick Install to continue.$\r$\n$\r$\nCopyright 2026 by Ciana Tech Ltd.$\r$\nhttps://cianatech.com.au/"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInstall
  ; A new stamp on EVERY install run (even the same installer twice): the app compares it with the one it has
  ; already seen and then offers keep-data / start-fresh. Does not rely on file dates.
  Push $1
  Push $2
  System::Call 'kernel32::GetSystemTimeAsFileTime(*l .r1)'
  FileOpen $2 "$INSTDIR\resources\install-stamp" w
  FileWrite $2 "$1"
  FileClose $2
  Pop $2
  Pop $1

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

  ; Real uninstall (an upgrade passes --updated and never gets here): ALWAYS ask whether to also delete
  ; the data. YES = clean start for a later install; NO = keep it for a future installation.
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "Also delete ALL Panic Alarm Server data on this computer?$\n$\nYES = remove everything (clean start; restore from a backup later if needed).$\nNO = keep the data for a future installation." IDNO keepData
    DetailPrint "Removing all Panic Alarm Server data..."
    ReadEnvStr $0 ProgramData
    ${If} $0 != ""
      RMDir /r "$0\PanicAlarmServer"
    ${EndIf}
    ; Every Windows user's own settings (plain cmd - no PowerShell / execution-policy bypass, which antivirus dislikes)
    nsExec::Exec 'cmd.exe /d /c for /d %u in ("%SystemDrive%\Users\*") do (rd /s /q "%u\AppData\Roaming\panic-alarm-server" 2>nul & del /f /q "%u\AppData\Local\PanicAlarm\server-stopped.flag" 2>nul)'
  keepData:
  ${endIf}
!macroend
