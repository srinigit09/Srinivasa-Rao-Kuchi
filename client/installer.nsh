!macro customInstall
  DetailPrint "Configuring Windows Firewall rules for Panic Alarm Client..."
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Client" dir=in action=allow program="$INSTDIR\PanicAlarmClient.exe" enable=yes profile=any'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Panic Alarm Client Outbound" dir=out action=allow program="$INSTDIR\PanicAlarmClient.exe" enable=yes profile=any'
!macroend

!macro customUnInstall
  DetailPrint "Removing Windows Firewall rules for Panic Alarm Client..."
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Client"'
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Panic Alarm Client Outbound"'
!macroend
