# 设置界面国际化修复计划

## 修复目标
将所有设置界面的硬编码英文文本替换为 i18n 翻译，使用 `src/i18n/locales/zh/translation.json` 中已有的翻译。

## 文件清单

### 导航组件 (1个)
1. `src/features/settings/components/SettingsNav.tsx`
   - 11 个导航标签

### 设置区域组件 (11个)
2. `src/features/settings/components/sections/SettingsProjectsSection.tsx`
3. `src/features/settings/components/sections/SettingsEnvironmentsSection.tsx`
4. `src/features/settings/components/sections/SettingsDisplaySection.tsx`
5. `src/features/settings/components/sections/SettingsComposerSection.tsx`
6. `src/features/settings/components/sections/SettingsDictationSection.tsx`
7. `src/features/settings/components/sections/SettingsShortcutsSection.tsx`
8. `src/features/settings/components/sections/SettingsOpenAppsSection.tsx`
9. `src/features/settings/components/sections/SettingsGitSection.tsx`
10. `src/features/settings/components/sections/SettingsCodexSection.tsx`
11. `src/features/settings/components/sections/SettingsServerSection.tsx`
12. `src/features/settings/components/sections/SettingsFeaturesSection.tsx`

## 修复步骤（每个文件）

### 步骤 1: 导入 useTranslation
在每个文件顶部添加：
```typescript
import { useTranslation } from "react-i18next";
```

### 步骤 2: 在组件中获取翻译函数
```typescript
export function SettingsXxxSection({ ... }: SettingsXxxSectionProps) {
  const { t } = useTranslation();  // 添加这一行
```

### 步骤 3: 替换硬编码文本
查找所有用户可见的硬编码英文文本，替换为 `t('路径')`。

**示例**:
```typescript
// 修复前
<div className="settings-section-title">Display & Sound</div>

// 修复后
<div className="settings-section-title">{t('settings.sections.display_sound')}</div>
```

## 翻译键路径参考

### SettingsNav.tsx
- `settings.sections.workspaces` → "工作区"
- `settings.sections.environment` → "环境"
- `settings.sections.display_sound` → "显示与声音"
- `settings.sections.composer` → "编写器"
- `settings.sections.dictation` → "听写"
- `settings.sections.keyboard_shortcuts` → "快捷键"
- `settings.sections.open_with` → "打开方式"
- `settings.features.git` → "Git" (需要确认翻译键)
- `settings.features.server` → "Server" (需要确认翻译键)
- `settings.sections.codex` → "Codex"
- `settings.sections.features` → "功能"

### 常用翻译键
- `common.save` → "保存"
- `common.cancel` → "取消"
- `common.confirm` → "确认"
- `common.close` → "关闭"
- `common.error` → "错误"
- `common.loading` → "加载中..."
- `common.delete` → "删除"
- `common.add` → "添加"

### 各区域翻译键

#### DisplaySection
- `settings.display_sound.theme` → 主题相关
- `settings.display_sound.follow_system` → "跟随系统"
- `settings.display_sound.dim` → "微暗"
- `settings.display_sound.ui_scale` → "界面缩放"

#### ComposerSection
- `settings.composer.presets` → "预设"
- `settings.composer.code_fences` → "代码围栏"

#### 等等...

## 重要注意事项

### 1. 识别用户可见文本
**需要翻译的文本**:
- 按钮文本
- 标签文本
- 描述文本
- 错误消息
- 占位符文本

**不需要翻译的文本**:
- CSS 类名
- ID 名称
- 变量名
- 函数名
- 技术术语（如 "localhost", "http"）

### 2. 翻译键路径格式
使用点号分隔的路径，例如：
- `settings.sections.workspaces`
- `settings.features.collaboration_mode`

### 3. 复数处理
如果文本包含数量，使用翻译的复数形式：
```typescript
{count} 个未关闭
// 在 translation.json 中处理复数
```

### 4. 动态值插值
如果文本包含动态值，使用插值语法：
```typescript
t('settings.features.open_in_file_manager', { fileManagerName: 'Finder' })
```

### 5. HTML 标签内的文本
保留 HTML 标签，只替换文本内容：
```typescript
// 修复前
<div>Open in <code>Finder</code></div>

// 修复后
<div>{t('settings.features.open_in_file_manager', { fileManagerName: '<code>Finder</code>' })}</div>
// 或者
<div>{t('settings.features.open_in_file_manager').replace('{fileManagerName}', '<code>Finder</code>')}</div>
```

## 验证清单

每个文件修复完成后，需要验证：

- [ ] 文件中所有用户可见的英文文本都已替换为翻译键
- [ ] 翻译键在 `src/i18n/locales/zh/translation.json` 中存在
- [ ] 使用 `npm run typecheck` 验证没有 TypeScript 错误
- [ ] 使用 `npm run lint` 验证没有 lint 错误

## 代理任务分配

### 代理 1: SettingsNav.tsx
- 修复导航标签的翻译

### 代理 2: SettingsDisplaySection.tsx + SettingsComposerSection.tsx
- 修复显示和编写器设置的翻译

### 代理 3: SettingsDictationSection.tsx + SettingsShortcutsSection.tsx
- 修复听写和快捷键设置的翻译

### 代理 4: SettingsOpenAppsSection.tsx + SettingsProjectsSection.tsx
- 修复打开方式和工作区设置的翻译

### 代理 5: SettingsGitSection.tsx + SettingsEnvironmentsSection.tsx
- 修复 Git 和环境设置的翻译

### 代理 6: SettingsCodexSection.tsx + SettingsServerSection.tsx + SettingsFeaturesSection.tsx
- 修复 Codex、服务器和功能设置的翻译

## 预期结果

修复完成后：
- 所有设置界面显示中文
- 通过 TypeScript 类型检查
- 通过 lint 检查
- 所有测试仍然通过

## 回退计划

如果修复出现问题：
- 使用 `git checkout -- <file>` 恢复单个文件
- 使用 `git reset --hard HEAD` 恢复所有更改
- 检查翻译键是否正确
- 检查翻译文件中是否存在对应的翻译