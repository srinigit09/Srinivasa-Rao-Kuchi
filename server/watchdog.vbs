' Panic Alarm Server watchdog (Windows). Run every minute by a scheduled task for any logged-in user.
' Starts the server again if THIS user's copy is not running (crash, Task Manager kill, ...),
' unless the admin deliberately stopped it (marker file written by the app's confirmed Stop).
' If another user's session already runs the server, the extra copy simply stands by and takes over
' automatically when that session ends.
Option Explicit
Const EXE_NAME  = "PanicAlarmServer.exe"
Const FLAG_NAME = "server-stopped.flag"

Dim sh, fso, flag, exePath, wmi, procs, p, owner, domain, me
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

flag = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\PanicAlarm\" & FLAG_NAME
If fso.FileExists(flag) Then WScript.Quit 0

me = LCase(sh.ExpandEnvironmentStrings("%USERNAME%"))
On Error Resume Next
Set wmi   = GetObject("winmgmts:\\.\root\cimv2")
Set procs = wmi.ExecQuery("Select * From Win32_Process Where Name = '" & EXE_NAME & "'")
If Err.Number = 0 Then
  For Each p In procs
    owner = "" : domain = ""
    p.GetOwner owner, domain
    If LCase(owner) = me Then WScript.Quit 0
  Next
End If
On Error GoTo 0

' resources\watchdog.vbs  ->  <install dir>\PanicAlarmServer.exe
exePath = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)) & "\" & EXE_NAME
If fso.FileExists(exePath) Then sh.Run """" & exePath & """", 1, False
