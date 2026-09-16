Set objFSO = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
strPath = objFSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run "node_modules\electron\dist\electron.exe .", 0, False
