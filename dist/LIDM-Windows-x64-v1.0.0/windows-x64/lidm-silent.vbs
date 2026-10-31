' LIDM Silent Launcher for Windows
' Launches LIDM background engine and opens standalone UI window without flashing cmd black box.
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
ExePath = Chr(34) & ScriptDir & "\lidm.exe" & Chr(34) & " ui"
WshShell.Run ExePath, 0, False
