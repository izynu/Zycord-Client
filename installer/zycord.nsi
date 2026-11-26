; Zycord patcher installer
;
; Installs Zycord into an existing Discord installation by replacing
; resources/app.asar and keeping the original as resources/_app.asar.
;
; The work happens here rather than in the Node CLI because a machine with
; Discord installed usually has no Node runtime. The patched asar and its
; assets are shipped inside this installer, so nothing is fetched at install
; time. Only Update touches the network.

Unicode true
ManifestDPIAware true

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"

; INetC is not part of every NSIS distribution; it is staged beside this file.
!addplugindir "plugins"

!define APP_NAME "Zycord"
!define APP_VERSION "1.0.0"
!define APP_PUBLISHER "Zynu"
!define APP_URL "https://github.com/izynu/Zycord-Client"
!ifndef UPDATE_URL
!define UPDATE_URL "https://github.com/izynu/Zycord-Client/releases/latest/download/Zycord-Patcher.asar"
!endif
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Zycord"
!define PAYLOAD_DIR "payload"

Var Channel

Name "${APP_NAME} ${APP_VERSION}"
!ifndef ZYCORD_OUTFILE
!define ZYCORD_OUTFILE "..\release\Zycord-Patcher-Setup-${APP_VERSION}.exe"
!endif
OutFile "${ZYCORD_OUTFILE}"
RequestExecutionLevel admin
SetDatablockOptimize on
SetCompressor /SOLID lzma
ShowInstDetails show
ShowUninstDetails show

!define MUI_ABORTWARNING

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "FileDescription" "Installs Zycord into an existing Discord"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "LegalCopyright" "GPL-3.0-or-later"

Var Action
Var Dlg
Var RadioInstall
Var RadioRepair
Var RadioUpdate
Var RadioUninstall
Var Patched
Var Result
Var Root

; ----------------------------------------------------------------- updating

; Downloads the current app.asar from the latest release and copies it over
; every patched build. A single file, so there is nothing to unpack.
Function DoUpdate
    DetailPrint "Contacting GitHub for the latest Zycord build..."

    Delete "$TEMP\ZycordUpdate.asar"
    INetC::get /CANCELTEXT "Cancel" /QUESTION "Download the latest Zycord build?" \
        /POPUP "${APP_URL}/releases/latest" "${UPDATE_URL}" "$TEMP\ZycordUpdate.asar" /END
    Pop $R0

    ${If} $R0 != "OK"
        DetailPrint "Update cancelled. Nothing was changed."
        Return
    ${EndIf}
    ${IfNot} ${FileExists} "$TEMP\ZycordUpdate.asar"
        DetailPrint "Download failed. Nothing was changed."
        Return
    ${EndIf}

    StrCpy $Patched 0
    StrCpy $Root "$LOCALAPPDATA\Discord"
    Call UpdateChannel
    StrCpy $Root "$APPDATA\Discord"
    Call UpdateChannel
    StrCpy $Root "$LOCALAPPDATA\DiscordPTB"
    Call UpdateChannel
    StrCpy $Root "$APPDATA\DiscordPTB"
    Call UpdateChannel
    StrCpy $Root "$LOCALAPPDATA\DiscordCanary"
    Call UpdateChannel
    StrCpy $Root "$APPDATA\DiscordCanary"
    Call UpdateChannel
    StrCpy $Root "$LOCALAPPDATA\DiscordDevelopment"
    Call UpdateChannel
    StrCpy $Root "$APPDATA\DiscordDevelopment"
    Call UpdateChannel

    Delete "$TEMP\ZycordUpdate.asar"
FunctionEnd

; Replaces the patch only where a backup already exists, so update never
; patches a Discord that was never installed into.
Function UpdateChannel
    ${IfNot} ${FileExists} "$Root\app-*"
        Return
    ${EndIf}

    FindFirst $R3 $R4 "$Root\app-*"
    uloop:
        ${If} $R4 == ""
            Goto udone
        ${EndIf}

        ${If} ${FileExists} "$Root\$R4\resources\_app.asar"
            ClearErrors
            Delete "$Root\$R4\resources\app.asar"
            CopyFiles /SILENT "$TEMP\ZycordUpdate.asar" "$Root\$R4\resources\app.asar"
            ${If} ${FileExists} "$Root\$R4\resources\app.asar"
                StrCpy $Patched 1
                DetailPrint "Updated $Root\$R4\resources"
            ${Else}
                DetailPrint "Write failed for $Root\$R4\resources\app.asar"
            ${EndIf}
        ${EndIf}

        FindNext $R3 $R4
        Goto uloop
    udone:
    FindClose $R3
FunctionEnd

; ------------------------------------------------------- Discord enumeration

; Discord keeps one folder per installed build, app-<version>, and launches
; whichever one it currently points at. That cannot be decided from the folder
; name: "app-1.0.10001" sorts below "app-1.0.9999" as a string, and Discord's
; own index file is not a documented format. So every app-* folder that has a
; resources\app.asar is patched. It costs a few hundred kilobytes per build and
; it cannot pick the wrong one.
;
; Discord installs to %LocalAppData%\Discord; older and portable layouts use
; %AppData%. Both are searched.
;
; $0 counts builds whose backup was staged, $1 counts builds patched.

!macro RunChannel CHANNEL
    StrCpy $Root "$LOCALAPPDATA\${CHANNEL}"
    Call PatchChannel
    StrCpy $Root "$APPDATA\${CHANNEL}"
    Call PatchChannel
!macroend

; Backs up app.asar and writes the patch for every build under $Root.
; The payload is extracted once by the section into $TEMP\ZycordPatch, so the
; copy here is a plain file copy that works inside a runtime loop.
Function PatchChannel
    ${IfNot} ${FileExists} "$Root\app-*"
        Return
    ${EndIf}

    FindFirst $R3 $R4 "$Root\app-*"
    ploop:
        ${If} $R4 == ""
            Goto pdone
        ${EndIf}

        StrCpy $R9 "$Root\$R4\resources"

        ${IfNot} ${FileExists} "$R9\app.asar"
            Goto pnext
        ${EndIf}

        ; Discord holds the asar open while it runs; a failed rename here is the
        ; most common reason a patch silently does nothing.
        ${IfNot} ${FileExists} "$R9\_app.asar"
            ClearErrors
            Rename "$R9\app.asar" "$R9\_app.asar"
            ${If} ${Errors}
                DetailPrint "Could not back up $R9\app.asar. Close Discord and run this again."
                Goto pnext
            ${EndIf}
            DetailPrint "Backed up the original at $R9\_app.asar"
        ${EndIf}

        ClearErrors
        Delete "$R9\app.asar"
        CopyFiles /SILENT "$TEMP\ZycordPatch\app.asar" "$R9\app.asar"

        ; Confirm the write landed. Without this a failed copy still reports success.
        ${IfNot} ${FileExists} "$R9\app.asar"
            DetailPrint "Write failed for $R9\app.asar"
            Goto pnext
        ${EndIf}

        StrCpy $Patched 1
        DetailPrint "Zycord installed into $R9"

    pnext:
        FindNext $R3 $R4
        Goto ploop
    pdone:
    FindClose $R3
FunctionEnd

Function RestoreChannel
    ${IfNot} ${FileExists} "$Root\app-*"
        Return
    ${EndIf}

    FindFirst $R3 $R4 "$Root\app-*"
    rloop:
        ${If} $R4 == ""
            Goto rdone
        ${EndIf}

        ${If} ${FileExists} "$Root\$R4\resources\_app.asar"
            Delete "$Root\$R4\resources\app.asar"
            Rename "$Root\$R4\resources\_app.asar" "$Root\$R4\resources\app.asar"
            DetailPrint "Restored the original client at $Root\$R4\resources"
        ${EndIf}

        FindNext $R3 $R4
        Goto rloop
    rdone:
    FindClose $R3
FunctionEnd

Function RestoreEverything
    StrCpy $Root "$LOCALAPPDATA\Discord"
    Call RestoreChannel
    StrCpy $Root "$APPDATA\Discord"
    Call RestoreChannel
    StrCpy $Root "$LOCALAPPDATA\DiscordPTB"
    Call RestoreChannel
    StrCpy $Root "$APPDATA\DiscordPTB"
    Call RestoreChannel
    StrCpy $Root "$LOCALAPPDATA\DiscordCanary"
    Call RestoreChannel
    StrCpy $Root "$APPDATA\DiscordCanary"
    Call RestoreChannel
    StrCpy $Root "$LOCALAPPDATA\DiscordDevelopment"
    Call RestoreChannel
    StrCpy $Root "$APPDATA\DiscordDevelopment"
    Call RestoreChannel
FunctionEnd

; --------------------------------------------------------------------- pages

Function .onInit
    ${GetParameters} $R0
    ${GetOptions} $R0 "/ACTION=" $Action
    ${If} $Action == ""
        StrCpy $Action "install"
    ${EndIf}

    StrCpy $Result ""
FunctionEnd

Function ActionPage
    !insertmacro MUI_HEADER_TEXT "Choose an action" "Zycord installs into Discord. Discord stays installed."

    nsDialogs::Create 1018
    Pop $Dlg
    ${If} $Dlg == error
        Abort
    ${EndIf}

    ${NSD_CreateRadioButton} 0 0u 100% 14u "Install - add Zycord to your existing Discord"
    Pop $RadioInstall
    ${NSD_CreateRadioButton} 0 22u 100% 14u "Repair - rewrite the patch if something broke"
    Pop $RadioRepair
    ${NSD_CreateRadioButton} 0 44u 100% 14u "Update - download the latest Zycord build"
    Pop $RadioUpdate
    ${NSD_CreateRadioButton} 0 66u 100% 14u "Uninstall - restore Discord and delete Zycord's files"
    Pop $RadioUninstall

    ${NSD_CreateLabel} 0 96u 100% 40u "Install keeps a backup of Discord's original app.asar, so Uninstall can always put it back. Your Discord login and settings are not touched."
    Pop $R1

    ${If} $Action == "repair"
        ${NSD_SetState} $RadioRepair ${BST_CHECKED}
    ${ElseIf} $Action == "update"
        ${NSD_SetState} $RadioUpdate ${BST_CHECKED}
    ${ElseIf} $Action == "uninstall"
        ${NSD_SetState} $RadioUninstall ${BST_CHECKED}
    ${Else}
        ${NSD_SetState} $RadioInstall ${BST_CHECKED}
    ${EndIf}

    nsDialogs::Show
FunctionEnd

Function ActionPageLeave
    ${NSD_GetState} $RadioInstall $R0
    ${If} $R0 == ${BST_CHECKED}
        StrCpy $Action "install"
    ${EndIf}
    ${NSD_GetState} $RadioRepair $R0
    ${If} $R0 == ${BST_CHECKED}
        StrCpy $Action "repair"
    ${EndIf}
    ${NSD_GetState} $RadioUpdate $R0
    ${If} $R0 == ${BST_CHECKED}
        StrCpy $Action "update"
    ${EndIf}
    ${NSD_GetState} $RadioUninstall $R0
    ${If} $R0 == ${BST_CHECKED}
        StrCpy $Action "uninstall"
    ${EndIf}
FunctionEnd

!insertmacro MUI_PAGE_WELCOME
Page custom ActionPage ActionPageLeave
!insertmacro MUI_PAGE_INSTFILES
Page custom FinishPage

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; The stock finish page says "Completed" no matter what happened, so a run that
; found no Discord still looked successful. This page reports the real outcome.
Function FinishPage
    ${If} $Result == "nofound"
        !insertmacro MUI_HEADER_TEXT "Close Discord first" "Nothing was changed."
        nsDialogs::Create 1018
        Pop $Dlg
        ${If} $Dlg == error
            Abort
        ${EndIf}
        ${NSD_CreateLabel} 0 0u 100% 44u "Discord keeps its program files open while it runs, so it has to be closed before Zycord can be installed. Close Discord completely, including the tray icon, then run this installer again."
        Pop $R1
        nsDialogs::Show
        Return
    ${EndIf}

    ${If} $Result == "notfound"
        !insertmacro MUI_HEADER_TEXT "Discord was not found" "No patched install was created."
        nsDialogs::Create 1018
        Pop $Dlg
        ${If} $Dlg == error
            Abort
        ${EndIf}

        ${NSD_CreateLabel} 0 0u 100% 24u "Zycord looked for Discord in both of these folders:"
        Pop $R1
        ${NSD_CreateLabel} 8u 24u 100% 20u "$LOCALAPPDATA\Discord"
        Pop $R1
        ${NSD_CreateLabel} 8u 42u 100% 20u "$APPDATA\Discord"
        Pop $R1
        ${NSD_CreateLabel} 0 68u 100% 40u "If Discord is installed somewhere else, or only the Microsoft Store version is installed, tell Zynu so the installer can be extended. Nothing was changed on this PC."
        Pop $R1
        nsDialogs::Show
        Return
    ${EndIf}

    ${If} $Result == "noupdate"
        !insertmacro MUI_HEADER_TEXT "Nothing to update" "Zycord is not currently installed in Discord."
        nsDialogs::Create 1018
        Pop $Dlg
        ${If} $Dlg == error
            Abort
        ${EndIf}
        ${NSD_CreateLabel} 0 0u 100% 40u "Update only applies to a Discord that already has Zycord in it. Run the installer again and choose Install."
        Pop $R1
        nsDialogs::Show
        Return
    ${EndIf}

    ${If} $Result == "installed"
        !insertmacro MUI_HEADER_TEXT "Zycord is installed" "Start Discord the way you normally do."
        nsDialogs::Create 1018
        Pop $Dlg
        ${If} $Dlg == error
            Abort
        ${EndIf}
        ${NSD_CreateLabel} 0 0u 100% 44u "Discord has been patched. Open Discord normally; the plugin settings are under Settings, then Zycord. Your original client is kept as _app.asar, so Uninstall restores it."
        Pop $R1
        nsDialogs::Show
        Return
    ${EndIf}

    ${If} $Result == "updated"
        !insertmacro MUI_HEADER_TEXT "Zycord is updated" "Start Discord the way you normally do."
        nsDialogs::Create 1018
        Pop $Dlg
        ${If} $Dlg == error
            Abort
        ${EndIf}
        ${NSD_CreateLabel} 0 0u 100% 40u "The latest Zycord build has been applied. Start Discord normally."
        Pop $R1
        nsDialogs::Show
        Return
    ${EndIf}

    ${If} $Result == "uninstalled"
        !insertmacro MUI_HEADER_TEXT "Zycord was removed" "Discord is back to its original state."
        nsDialogs::Create 1018
        Pop $Dlg
        ${If} $Dlg == error
            Abort
        ${EndIf}
        ${NSD_CreateLabel} 0 0u 100% 40u "The original app.asar has been restored and Zycord's settings folder was removed. Discord will start normally."
        Pop $R1
        nsDialogs::Show
        Return
    ${EndIf}

    Abort
FunctionEnd

!insertmacro MUI_LANGUAGE "English"

; -------------------------------------------------------------------- action

Section
    ${If} $Action == "uninstall"
        StrCpy $Result "uninstalled"
        Call RestoreEverything
        RMDir /r "$APPDATA\Zycord"
        DetailPrint "Removed Zycord settings and themes."
        DeleteRegKey HKCU "${UNINST_KEY}"
        Goto finish
    ${EndIf}

    ${If} $Action == "update"
        Call DoUpdate
        ${If} $Patched == 0
            StrCpy $Result "noupdate"
        ${Else}
            StrCpy $Result "updated"
        ${EndIf}
        Goto finish
    ${EndIf}

    ; Discord keeps the asar open while it runs, so the rename and copy below
    ; fail on a running client. Stop with an explanation rather than reporting a
    ; patch that did not happen.
    nsProcess::_FindProcess "Discord.exe"
    Pop $R0
    ${If} $R0 == 0
        DetailPrint "Discord is running."
        ${If} ${Silent}
            MessageBox MB_ICONSTOP "Close Discord and run this again. Nothing was changed."
        ${Else}
            MessageBox MB_ICONEXCLAMATION "Close Discord first, then run this again. Nothing was changed."
        ${EndIf}
        StrCpy $Result "nofound"
        Goto finish
    ${EndIf}

    ; Extract the payload once; every target gets a copy of this file.
    RMDir /r "$TEMP\ZycordPatch"
    SetOutPath "$TEMP\ZycordPatch"
    File "/oname=app.asar" "${PAYLOAD_DIR}\app.asar"
    SetOutPath "$TEMP"

    StrCpy $Patched 0
    StrCpy $Root ""
    !insertmacro RunChannel "Discord"
    !insertmacro RunChannel "DiscordPTB"
    !insertmacro RunChannel "DiscordCanary"
    !insertmacro RunChannel "DiscordDevelopment"

    RMDir /r "$TEMP\ZycordPatch"

    ${If} $Patched == 0
        StrCpy $Result "notfound"
        Goto finish
    ${Else}
        StrCpy $Result "installed"
        CreateDirectory "$APPDATA\Zycord"
        WriteUninstaller "$APPDATA\Zycord\Uninstall Zycord.exe"
        WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "Zycord"
        WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
        WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_PUBLISHER}"
        WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout" "${APP_URL}"
        WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$APPDATA\Zycord\Uninstall Zycord.exe" /ACTION=uninstall'
        WriteRegStr HKCU "${UNINST_KEY}" "NoModify" "1"
        WriteRegStr HKCU "${UNINST_KEY}" "NoRepair" "1"
    ${EndIf}

    ${If} $Result == "installed"
        DetailPrint "Done. Discord was patched."
    ${ElseIf} $Result == "notfound"
        DetailPrint "Nothing was changed: Discord was not found."
    ${ElseIf} $Result == "nofound"
        DetailPrint "Nothing was changed: Discord was running."
    ${ElseIf} $Result == "updated"
        DetailPrint "Done. Zycord was updated."
    ${ElseIf} $Result == "noupdate"
        DetailPrint "Nothing was changed: Zycord is not installed."
    ${ElseIf} $Result == "uninstalled"
        DetailPrint "Done. Discord was restored."
    ${EndIf}

    finish:
SectionEnd
