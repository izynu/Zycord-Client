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

; --------------------------------------------------------------- channel scan

; $R0 becomes "<appdata>\<Channel>\app-<newest>", or "" when that channel is
; not installed. ReadDir order is unspecified, so compare names as decimals:
; app-1.0.9200 sorts above app-1.0.9 by embedded-numeric field order only if we
; compare field by field, which is what the version cookie does below.
!macro FindNewest CHANNEL FUNCNAME
Function ${FUNCNAME}
    StrCpy $R0 ""
    StrCpy $R1 "$APPDATA\${CHANNEL}"
    ${IfNot} ${FileExists} "$R1\app-*"
        Return
    ${EndIf}

    StrCpy $R2 ""
    FindFirst $R3 $R4 "$R1\app-*"
    loop:
        ${If} $R4 == ""
            Goto loopdone
        ${EndIf}
        ${If} ${FileExists} "$R1\$R4\resources\app.asar"
            Call CompareVersionNames
            ${If} $R6 == "newer"
                StrCpy $R2 "$R4"
            ${EndIf}
        ${EndIf}
        FindNext $R3 $R4
        Goto loop
    loopdone:
    FindClose $R3

    ${If} $R2 != ""
        StrCpy $R0 "$R1\$R2"
    ${EndIf}
FunctionEnd
!macroend

; Compares $R4 (candidate) against $R2 (current best); sets $R6 to
; "newer" when the candidate should win. Both are "app-<version>" names.
Function CompareVersionNames
    StrCpy $R6 "older"
    ${If} $R2 == ""
        StrCpy $R6 "newer"
        Return
    ${EndIf}

    ${If} $R4 S> $R2
        StrCpy $R6 "newer"
    ${EndIf}
FunctionEnd

!insertmacro FindNewest "Discord" FindNewestStable
!insertmacro FindNewest "DiscordPTB" FindNewestPTB
!insertmacro FindNewest "DiscordCanary" FindNewestCanary
!insertmacro FindNewest "DiscordDevelopment" FindNewestDev

; ------------------------------------------------------------------ patching

; Patch whatever channel is named in $Channel, using that channel's payload.
Function PatchChannel
    StrCpy $R0 ""
    ${If} $Channel == "stable"
        Call FindNewestStable
    ${ElseIf} $Channel == "ptb"
        Call FindNewestPTB
    ${ElseIf} $Channel == "canary"
        Call FindNewestCanary
    ${ElseIf} $Channel == "dev"
        Call FindNewestDev
    ${EndIf}

    ${If} $R0 == ""
        DetailPrint "Not installed or already patched: $Channel"
        Return
    ${EndIf}

    ${IfNot} ${FileExists} "$R0\resources\app.asar"
        DetailPrint "Skipped: $R0 has no resources\app.asar"
        Return
    ${EndIf}

    ; The backup is the only copy of the original client, so never replace it.
    ${IfNot} ${FileExists} "$R0\resources\_app.asar"
        Rename "$R0\resources\app.asar" "$R0\resources\_app.asar"
        DetailPrint "Backed up the original at $R0\resources\_app.asar"
    ${EndIf}

    SetOutPath "$R0\resources"
    ${If} $Channel == "stable"
        File "/oname=app.asar" "${PAYLOAD_DIR}\stable\app.asar"
    ${ElseIf} $Channel == "ptb"
        File "/oname=app.asar" "${PAYLOAD_DIR}\ptb\app.asar"
    ${ElseIf} $Channel == "canary"
        File "/oname=app.asar" "${PAYLOAD_DIR}\canary\app.asar"
    ${Else}
        File "/oname=app.asar" "${PAYLOAD_DIR}\dev\app.asar"
    ${EndIf}

    StrCpy $Patched 1
    DetailPrint "Zycord installed into $R0"
FunctionEnd

Function DoUpdate
    DetailPrint "Contacting GitHub for the latest Zycord build..."

    Delete "$TEMP\ZycordUpdate.asar"

    ; The update payload is a single app.asar, the same file the installer
    ; carries. Downloading it directly avoids depending on an extractor.
    INetC::get /CANCELTEXT "Cancel" /QUESTION "Download the latest Zycord build?" \
        /POPUP "${APP_URL}/releases/latest" "${UPDATE_URL}" "$TEMP\ZycordUpdate.asar" /END
    Pop $R0

    ${If} $R0 != "OK"
        DetailPrint "Update cancelled. Nothing was changed."
        Return
    ${EndIf}
    ${IfNot} ${FileExists} "$TEMP\ZycordUpdate.asar"
        MessageBox MB_ICONSTOP "The update could not be downloaded."
        Return
    ${EndIf}

    StrCpy $Patched 0
    StrCpy $Channel "stable"
    Call UpdateChannel
    StrCpy $Channel "ptb"
    Call UpdateChannel
    StrCpy $Channel "canary"
    Call UpdateChannel
    StrCpy $Channel "dev"
    Call UpdateChannel

    ${If} $Patched == 0
        MessageBox MB_ICONEXCLAMATION "No patched Discord install was found. Use Install instead."
    ${Else}
        DetailPrint "Update applied."
    ${EndIf}

    Delete "$TEMP\ZycordUpdate.asar"
FunctionEnd

; Like PatchChannel, but the payload comes from the downloaded package.
Function UpdateChannel
    ${If} $Channel == "stable"
        Call FindNewestStable
    ${ElseIf} $Channel == "ptb"
        Call FindNewestPTB
    ${ElseIf} $Channel == "canary"
        Call FindNewestCanary
    ${ElseIf} $Channel == "dev"
        Call FindNewestDev
    ${EndIf}

    ${If} $R0 == ""
        Return
    ${EndIf}
    ${IfNot} ${FileExists} "$TEMP\ZycordUpdate.asar"
        Return
    ${EndIf}
    ${IfNot} ${FileExists} "$R0\resources\_app.asar"
        DetailPrint "Not patched, skipping: $Channel"
        Return
    ${EndIf}

    ; Runtime copy: File is compile-time only, and this payload was downloaded.
    SetOutPath "$R0\resources"
    Delete "$R0\resources\app.asar"
    CopyFiles /SILENT "$TEMP\ZycordUpdate.asar" "$R0\resources\app.asar"

    StrCpy $Patched 1
    DetailPrint "Updated $Channel at $R0"
FunctionEnd

Function PatchEverything
    StrCpy $Patched 0
    StrCpy $Channel "stable"
    Call PatchChannel
    StrCpy $Channel "ptb"
    Call PatchChannel
    StrCpy $Channel "canary"
    Call PatchChannel
    StrCpy $Channel "dev"
    Call PatchChannel
FunctionEnd

; ----------------------------------------------------------------- restoring

Function RestoreChannel
    ${If} $Channel == "stable"
        Call FindNewestStable
    ${ElseIf} $Channel == "ptb"
        Call FindNewestPTB
    ${ElseIf} $Channel == "canary"
        Call FindNewestCanary
    ${ElseIf} $Channel == "dev"
        Call FindNewestDev
    ${EndIf}

    ${If} $R0 == ""
        DetailPrint "Not installed: $Channel"
        Return
    ${EndIf}
    ${IfNot} ${FileExists} "$R0\resources\_app.asar"
        DetailPrint "Not patched: $Channel"
        Return
    ${EndIf}

    Delete "$R0\resources\app.asar"
    Rename "$R0\resources\_app.asar" "$R0\resources\app.asar"
    DetailPrint "Restored the original client at $R0"
FunctionEnd

Function RestoreEverything
    StrCpy $Channel "stable"
    Call RestoreChannel
    StrCpy $Channel "ptb"
    Call RestoreChannel
    StrCpy $Channel "canary"
    Call RestoreChannel
    StrCpy $Channel "dev"
    Call RestoreChannel
FunctionEnd

; --------------------------------------------------------------------- pages

Function .onInit
    ${GetParameters} $R0
    ${GetOptions} $R0 "/ACTION=" $Action
    ${If} $Action == ""
        StrCpy $Action "install"
    ${EndIf}
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
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

; -------------------------------------------------------------------- action

Section
    ${If} $Action == "uninstall"
        Call RestoreEverything
        RMDir /r "$APPDATA\Zycord"
        DetailPrint "Removed Zycord settings and themes."
        DeleteRegKey HKCU "${UNINST_KEY}"
        Goto finish
    ${EndIf}

    ${If} $Action == "update"
        Call DoUpdate
        Goto finish
    ${EndIf}

    Call PatchEverything

    ${If} $Patched == 0
        MessageBox MB_ICONEXCLAMATION|MB_YESNO \
            "No Discord installation was found, or Discord is already patched.$\r$\n$\r$\nOpen the Zycord page for help?" \
            IDNO finish
        ExecShell "open" "${APP_URL}#install"
    ${Else}
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

    finish:
SectionEnd
