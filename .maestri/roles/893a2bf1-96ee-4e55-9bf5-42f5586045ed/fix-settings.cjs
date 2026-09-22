const fs = require('node:fs');
const path = 'D:/ofertapro/src/hooks/useSettingsProfile.ts';
let source = fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
function replace(before, after) {
  if (!source.includes(before)) throw new Error('Expected source missing: ' + before.slice(0, 60));
  source = source.replace(before, after);
}
replace("  const [saving, setSaving] = useState(false);", "  const [saving, setSaving] = useState(false);\n  const saveInFlight = useRef(false);\n  const initializedUser = useRef<string | null>(null);");
replace("    if (user) {\n      setUsername", "    if (user && initializedUser.current !== user.id) {\n      initializedUser.current = user.id;\n      setUsername");
replace("  }, [user?.id]);", "    if (!user) initializedUser.current = null;\n  }, [user]);");
replace("    setUploadingAvatar(true);\n    try {\n      const localPreview = URL.createObjectURL(file);", "    setUploadingAvatar(true);\n    const previousUrl = avatarUrl;\n    const localPreview = URL.createObjectURL(file);\n    try {");
replace("      toast('Erro ao carregar avatar. Tente novamente.', 'error');", "      setAvatarUrl(previousUrl);\n      toast('Não foi possível carregar o avatar. Tente novamente.', 'error');");
replace("      setUploadingAvatar(false);", "      URL.revokeObjectURL(localPreview);\n      e.target.value = '';\n      setUploadingAvatar(false);");
replace("    setUploadingPublicAvatar(true);\n    try {\n      const localPreview = URL.createObjectURL(file);", "    setUploadingPublicAvatar(true);\n    const previousUrl = publicAvatarUrl;\n    const localPreview = URL.createObjectURL(file);\n    try {");
replace("      toast('Erro ao carregar foto pública. Tente novamente.', 'error');", "      setPublicAvatarUrl(previousUrl);\n      toast('Não foi possível carregar a foto pública. Tente novamente.', 'error');");
replace("      setUploadingPublicAvatar(false);", "      URL.revokeObjectURL(localPreview);\n      e.target.value = '';\n      setUploadingPublicAvatar(false);");
replace("    if (!user) return;\n\n    if (!fullName.trim())", "    if (!user || saveInFlight.current || uploadingAvatar || uploadingPublicAvatar) return;\n\n    if (!fullName.trim())");
replace("    const activatingPublicPage = isPublicActive && !user.public_page_active;\n    if (activatingPublicPage && !(await isCurrentEmailVerified())) {\n      toast(EMAIL_NOT_VERIFIED_MESSAGE, 'warning');\n      return;\n    }\n\n    setSaving(true);\n    try {", "    saveInFlight.current = true;\n    setSaving(true);\n    setSaved(false);\n    try {\n      const activatingPublicPage = isPublicActive && !user.public_page_active;\n      if (activatingPublicPage && !(await isCurrentEmailVerified())) {\n        toast(EMAIL_NOT_VERIFIED_MESSAGE, 'warning');\n        return;\n      }");
replace("      setSaved(true);", "      setUsername(cleanUsername);\n      setWhatsappGroupUrl(wppVal.normalized);\n      setTelegramGroupUrl(telVal.normalized);\n      setDiscordGroupUrl(discVal.normalized);\n      setSaved(true);");
replace("      toast(`Erro: ${err.message || 'Falha ao salvar configurações.'}`, 'error');", "      toast('Não foi possível salvar as configurações. Verifique sua conexão e tente novamente.', 'error');");
replace("    } finally {\n      setSaving(false);", "    } finally {\n      saveInFlight.current = false;\n      setSaving(false);");
replace("  const copyUrl = () => {\n    navigator.clipboard.writeText(`${getShortlinkUrl()}/${username}`);\n    setCopied(true);\n    setTimeout(() => setCopied(false), 2000);\n  };", "  const copyUrl = async () => {\n    try {\n      await navigator.clipboard.writeText(`${getShortlinkUrl()}/${user?.username || username}`);\n      setCopied(true);\n      setTimeout(() => setCopied(false), 2000);\n    } catch {\n      setCopied(false);\n      toast('Não foi possível copiar o link. Copie o endereço manualmente.', 'error');\n    }\n  };");
fs.writeFileSync(path, source);
