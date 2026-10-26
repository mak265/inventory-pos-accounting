$targetFiles = @(
    "c:\Users\reymark\Desktop\systems\Aberin_hardware\frontend\src\components\CashDrawer.vue",
    "c:\Users\reymark\Desktop\systems\Aberin_hardware\frontend\src\components\CustomerReport.vue",
    "c:\Users\reymark\Desktop\systems\Aberin_hardware\frontend\src\components\LowStockReport.vue",
    "c:\Users\reymark\Desktop\systems\Aberin_hardware\frontend\src\components\VendorReport.vue",
    "c:\Users\reymark\Desktop\systems\Aberin_hardware\frontend\src\pages\DeliveryList.vue",
    "c:\Users\reymark\Desktop\systems\Aberin_hardware\frontend\src\pages\ExpensesList.vue"
)

foreach ($f in $targetFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($f)
    # The garbled sequence in the file bytes for the peso sign
    # UTF-8 for peso sign is: E2 82 B1
    # But when double-encoded it becomes: C3 A2 C2 82 C2 B1 (6 bytes)
    # Let's just do text replacement with proper encoding
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    $pesoChar = [char]0x20B1  # actual peso sign unicode
    $newText = $text.Replace([string]$pesoChar, 'P')
    if ($newText -ne $text) {
        $newBytes = [System.Text.Encoding]::UTF8.GetBytes($newText)
        [System.IO.File]::WriteAllBytes($f, $newBytes)
        Write-Host "Fixed: $f"
    } else {
        Write-Host "No peso char found in: $f (trying byte pattern)"
        # Try finding the 3-byte UTF8 sequence E2 82 B1 and replace with 50 (P)
        $found = $false
        for ($i = 0; $i -lt $bytes.Length - 2; $i++) {
            if ($bytes[$i] -eq 0xE2 -and $bytes[$i+1] -eq 0x82 -and $bytes[$i+2] -eq 0xB1) {
                $found = $true
                break
            }
        }
        if ($found) {
            $hexStr = [System.BitConverter]::ToString($bytes) -replace '-',''
            $hexStr = $hexStr.Replace('E282B1', '50')
            $newBytes = [byte[]]::new($hexStr.Length / 2)
            for ($i = 0; $i -lt $newBytes.Length; $i++) {
                $newBytes[$i] = [Convert]::ToByte($hexStr.Substring($i*2, 2), 16)
            }
            [System.IO.File]::WriteAllBytes($f, $newBytes)
            Write-Host "Fixed via bytes: $f"
        } else {
            Write-Host "Could not find pattern in: $f"
        }
    }
}
Write-Host "All done"
