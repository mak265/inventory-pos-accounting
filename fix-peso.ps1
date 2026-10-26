$files = Get-ChildItem -Path "c:\Users\reymark\Desktop\systems\Aberin_hardware\frontend\src" -Recurse -Include "*.vue","*.ts"

foreach ($f in $files) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $content = [System.Text.Encoding]::UTF8.GetString($bytes)
    # Match the garbled sequence for peso sign: 0xC3 0xA2 0xE2 0x80 0x9A 0xC2 0xB1
    # In UTF-8 text it appears as multi-byte garbage
    $original = $content
    # Replace common garbled peso patterns
    $content = $content -replace '\xE2\x82\xB1', 'P'
    $content = $content.Replace([char]0x20B1, [char]0x50)
    if ($content -ne $original) {
        [System.IO.File]::WriteAllText($f.FullName, $content, (New-Object System.Text.UTF8Encoding $false))
        Write-Host "Fixed: $($f.Name)"
    }
}
Write-Host "Done"
