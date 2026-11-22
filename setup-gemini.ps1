# setup-gemini.ps1
# Google Gemini API açarını Vercel backend layihəsinə (esg-backend) əlavə edir
# və layihəni yenidən deploy edir. Açar yalnız sizin kompüterinizdən oxunur
# və birbaşa Vercel env-ə göndərilir; chat-a düşmür.
#
# İstifadə:
#   cd C:\Users\Alisov Kenan\Desktop\esg-backend
#   .\setup-gemini.ps1

$ErrorActionPreference = 'Stop'

Write-Host "Google AI Studio-dan (https://aistudio.google.com/apikey) alınmış Gemini API açarını yapışdırın." -ForegroundColor Cyan
Write-Host "Açar yazılarkən görünməyəcək; Enter ilə təsdiqləyin." -ForegroundColor DarkCyan
$secure = Read-Host -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Error "API açarı boşdur. Əməliyyat dayandırıldı."
  exit 1
}

$project = 'esg-backend'
$envs = @('-e', 'production', '-e', 'preview', '-e', 'development')

Write-Host "`nAI_PROVIDER=gemini əlavə edilir..." -ForegroundColor Green
"gemini" | npx vercel env add AI_PROVIDER --project $project @envs --force -y --no-sensitive

Write-Host "AI_MODEL=gemini-3.1-flash-lite əlavə edilir..." -ForegroundColor Green
"gemini-3.1-flash-lite" | npx vercel env add AI_MODEL --project $project @envs --force -y --no-sensitive

Write-Host "AI_API_KEY əlavə edilir (gizli)..." -ForegroundColor Green
$key | npx vercel env add AI_API_KEY --project $project @envs --force -y --sensitive

Write-Host "`nRedeploy edilir..." -ForegroundColor Green
npx vercel redeploy https://esg-backend-seven.vercel.app --environment production

Write-Host "`nHazırdır!" -ForegroundColor Cyan
Write-Host "Status yoxlamaq üçün:" -ForegroundColor Cyan
Write-Host "  https://esg-backend-seven.vercel.app/api/health" -ForegroundColor White
