' Panic Alarm Client: end a running screen saver / wake the display when an alarm arrives.
' Sends one F15 key press (a key no program uses). Started by the client only while an alarm is shown.
CreateObject("WScript.Shell").SendKeys "{F15}"
