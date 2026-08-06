Option Explicit

Dim shell, command, exitCode
Set shell = CreateObject("WScript.Shell")
command = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\USER\Desktop\Claude\compile-game\tools\run-cpu-training-automation.ps1"""
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
