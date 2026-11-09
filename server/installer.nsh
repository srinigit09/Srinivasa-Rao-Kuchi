!macro customInstall
  DetailPrint "Configuring Windows Firewall rules for Panic Alarm Server..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Server" dir=in action=allow program="$INSTDIR\PanicAlarmServer.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Server Port" dir=in action=allow protocol=TCP localport=5000 enable=yes profile=any'
!macroend

!macro customUnInstall
  DetailPrint "Removing Windows Firewall rules for Panic Alarm Server..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Server"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Server Port"'
!macroend
