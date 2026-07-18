<!--
  Notification Templates.vue (admin 端) - 通知模板管理

  v4 2026-07-18: 「本机构开关 = 本机构要不要这条通知」
    - 开关 off (默认) = 本机构未启用 → publish 不发送 (走 org-only 路径)
    - 开关 on         = 本机构已启用 → publish 走本机构副本文案 (upsert 时复用 platform 文案)
    - 「重置」按钮 = 删本机构副本, 回到「未启用」状态 (不发)
    - 平台默认只在 UI 预览用 + toggle 启用时作为初始文案 (复制), 不参与发送路径

  数据源:
    R-4010 listTemplates         列表 (org + platform 两条都返, 用于预览)
    R-4011 upsertTemplate        toggle 创建/更新 org 副本
    R-4017 removeTemplate        重置 = 删 org 副本
-->
<template>
  <div class="page-templates">
    <div class="page-templates__header">
      <h2>通知模板</h2>
      <p class="page-templates__desc">
        7 类系统通知的本机构文案与开关。
        「<strong>启用本机构</strong>」= 本机构启用该通知（默认未启用）；
        「<strong>停用</strong>」= 本机构该通知<strong>彻底不发</strong>。
        「<strong>重置</strong>」= 删除本机构自定义，回到未启用状态。
      </p>
    </div>

    <div class="page-templates__toolbar">
      <el-input
        v-model="filter.keyword"
        placeholder="搜索触发时机 / 接收人 / 标题"
        clearable
        autocomplete="off"
        style="width: 320px"
        @clear="recomputeView"
        @keyup.enter="recomputeView"
      />
      <el-button
        type="danger"
        plain
        :loading="resettingAll"
        @click="onResetAll"
      >全部重置本机构</el-button>
    </div>

    <el-table :data="filteredTemplates" v-loading="loading" border stripe style="width: 100%">
      <!-- 触发时机 (主) + 内部 type 小灰字 -->
      <el-table-column label="触发时机" min-width="220">
        <template #default="{ row }">
          <div class="page-templates__trigger">
            <div class="page-templates__trigger-main">
              {{ row._trigger.triggerText }}
              <el-tag
                v-if="row.effective === 'org'"
                type="warning"
                size="small"
                effect="plain"
              >本机构覆盖</el-tag>
              <el-tag v-else type="info" size="small" effect="plain">走平台默认</el-tag>
            </div>
            <el-tooltip :content="row._trigger.hint" placement="top" :show-after="200">
              <div class="page-templates__trigger-type">type: {{ row.type }}</div>
            </el-tooltip>
          </div>
        </template>
      </el-table-column>

      <!-- 接收人 chip (sub) -->
      <el-table-column label="接收人" width="180">
        <template #default="{ row }">
          <el-tag
            :type="row._trigger.recipientChipType"
            size="small"
            effect="light"
            class="page-templates__recipient"
          >
            <span class="page-templates__recipient-emoji">{{ row._trigger.recipientChip }}</span>
            {{ row._trigger.recipientText }}
          </el-tag>
        </template>
      </el-table-column>

      <!-- 标题 -->
      <el-table-column label="标题" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ (row.org || row.platform || {}).title }}</span>
        </template>
      </el-table-column>

      <!-- 正文预览 -->
      <el-table-column label="正文预览" min-width="240" show-overflow-tooltip>
        <template #default="{ row }">
          <span>{{ (row.org || row.platform || {}).body }}</span>
        </template>
      </el-table-column>

      <!-- 启用本机构 (v4 2026-07-18: 单开关, 无 chip, 默认未启用) -->
      <el-table-column label="启用本机构" width="120">
        <template #default="{ row }">
          <el-tooltip
            :content="row.org
              ? (row.org.isActive !== false ? '本机构已启用，点击停用 (通知将彻底不发)' : '本机构已停用，点击启用 (通知恢复发送)')
              : '本机构未启用 (通知不发送)；点击启用后将以平台默认文案为基础创建本机构副本'"
            placement="top"
            :show-after="300"
          >
            <el-switch
              :model-value="orgActive(row)"
              :loading="row._toggling"
              @change="(v) => onToggle(row, v)"
            />
          </el-tooltip>
        </template>
      </el-table-column>

      <!-- 操作: 编辑 / 重置 (org 覆盖才显示重置) -->
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button type="primary" link @click="onEdit(row)">编辑</el-button>
          <el-button
            v-if="row.effective === 'org'"
            type="danger"
            link
            @click="onReset(row)"
          >重置</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 编辑弹窗 (type read-only, 仅改 title/body/isActive) -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="640px" @closed="onDialogClosed">
      <el-form :model="form" label-width="100px" :rules="formRules" ref="formRef">
        <el-form-item label="触发时机">
          <div class="page-templates__form-static">
            {{ currentTriggerMeta.triggerText }} · {{ currentTriggerMeta.recipientText }}
          </div>
        </el-form-item>
        <el-form-item label="类型 (内部)">
          <el-input :model-value="form.type" disabled />
        </el-form-item>
        <el-form-item label="标题" prop="title">
          <el-input v-model="form.title" maxlength="256" show-word-limit />
        </el-form-item>
        <el-form-item label="正文" prop="body">
          <el-input v-model="form.body" type="textarea" :rows="4" maxlength="1024" show-word-limit />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.isActive" />
        </el-form-item>
        <el-form-item label="占位符">
          <div class="page-templates__placeholders">
            <el-tag
              v-for="p in placeholders"
              :key="p"
              size="small"
              effect="plain"
              class="page-templates__placeholder"
            >{{ p }}</el-tag>
          </div>
          <div class="page-templates__hint">渲染时仅替换以上白名单占位符；其他字段会被忽略。</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
import { ElMessage, ElMessageBox } from 'element-plus'
import { notificationApi } from '@/api/notification'
import { NOTIFICATION_TRIGGERS, NOTIFICATION_TRIGGER_MAP } from '@/constants/notificationTriggers'

const PLACEHOLDERS = [
  '{studentName}', '{courseName}', '{time}', '{endTime}',
  '{room}', '{teacherName}', '{orgName}', '{orderNo}',
  '{amount}', '{points}', '{days}', '{reason}',
  // 2026-07-13 新增 (任务相关)
  '{taskTitle}', '{actorName}', '{comment}', '{score}',
  '{dueAt}', '{priority}', '{studentNames}'
]

export default {
  name: 'NotificationTemplates',
  data() {
    return {
      loading: false,
      saving: false,
      resettingAll: false,
      filter: { keyword: '' },
      templates: [],
      dialogVisible: false,
      form: {
        _id: null,
        _isNewOrg: false,
        type: '',
        channel: 'inbox',
        title: '',
        body: '',
        wechatTemplateId: '',
        smsTemplateCode: '',
        isActive: true
      },
      formRules: {
        title: [{ required: true, message: '请输入标题', trigger: 'blur' }],
        body: [{ required: true, message: '请输入正文', trigger: 'blur' }]
      },
      placeholders: PLACEHOLDERS
    }
  },
  computed: {
    /** 按 NOTIFICATION_TRIGGERS 顺序排序, 加触发时机 meta */
    sortedTemplates() {
      return this.templates
        .slice()
        .sort((a, b) => {
          const ai = NOTIFICATION_TRIGGERS.findIndex((t) => t.type === a.type)
          const bi = NOTIFICATION_TRIGGERS.findIndex((t) => t.type === b.type)
          return ai - bi
        })
        .map((row) => ({
          ...row,
          _trigger: NOTIFICATION_TRIGGER_MAP[row.type] || {
            triggerText: row.type,
            recipientText: '?',
            recipientChip: '❓',
            recipientChipType: 'info',
            hint: '未在 NOTIFICATION_TRIGGERS 字表里的 type'
          },
          _toggling: false
        }))
    },
    filteredTemplates() {
      const kw = (this.filter.keyword || '').toLowerCase().trim()
      if (!kw) return this.sortedTemplates
      return this.sortedTemplates.filter((t) => {
        if ((t.type || '').toLowerCase().includes(kw)) return true
        const src = t.org || t.platform
        if (src && (src.title || '').toLowerCase().includes(kw)) return true
        if (t._trigger.triggerText.toLowerCase().includes(kw)) return true
        if (t._trigger.recipientText.toLowerCase().includes(kw)) return true
        return false
      })
    },
    dialogTitle() {
      return this.form._id ? '编辑通知模板' : '新建通知模板'
    },
    currentTriggerMeta() {
      return NOTIFICATION_TRIGGER_MAP[this.form.type] || {
        triggerText: this.form.type,
        recipientText: '?'
      }
    }
  },
  mounted() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await notificationApi.listTemplates()
        const data = res && res.data ? res.data : res
        this.templates = (data && data.items) || (Array.isArray(data) ? data : [])
      } catch (e) {
        ElMessage.error(e.message || '加载失败')
        this.templates = []
      } finally {
        this.loading = false
      }
    },
    recomputeView() {
      // computed 自动重算
    },
    /**
     * 开关状态 (v4 本机构维度):
     *   - 有 org 副本 → org.isActive (true = 启用 / false = 停用)
     *   - 无 org 副本 → false (默认未启用, 通知不发)
     */
    orgActive(row) {
      if (row.org) return row.org.isActive !== false
      return false
    },
    /**
     * 切换本机构开关 (v4 2026-07-18)
     *
     * 任何 toggle 都走 upsert 创建/更新 org 副本 (R-4011):
     *   - 当前无副本 + 开 → 创建 org 副本 isActive=true (以 platform 文案为初始)
     *   - 当前无副本 + 关 → 创建 org 副本 isActive=false (显式禁用)
     *   - 当前有副本 (不论 isActive) → upsert 更新 isActive 字段
     *
     * 后端 publish: org.isActive=false 或 tpl=null 都返 skipped (不发送).
     * 所以 v4 起, 新机构默认所有通知都不发, 必须显式启用才会发.
     */
    async onToggle(row, v) {
      row._toggling = true
      try {
        const src = row.org || row.platform || { title: '', body: '' }
        await notificationApi.upsertTemplate(row.type, row.channel, {
          title: src.title,
          body: src.body,
          isActive: v
        })
        ElMessage.success(v ? '已启用本机构通知' : '已停用本机构通知')
        await this.load()
      } catch (e) {
        ElMessage.error(e.message || '操作失败')
      } finally {
        row._toggling = false
      }
    },
    resetForm() {
      this.form = {
        _id: null,
        _isNewOrg: false,
        type: '',
        channel: 'inbox',
        title: '',
        body: '',
        wechatTemplateId: '',
        smsTemplateCode: '',
        isActive: true
      }
    },
    onEdit(row) {
      // v4 编辑: 总是以 org 副本为准.
      // - 有 org 副本 → 编辑 org
      // - 无 org 副本 → 编辑弹窗打开, 文案以 platform 默认填充, 保存时 upsert 创建 org 副本
      const src = row.org || row.platform
      if (!src) {
        ElMessage.warning('该通知没有任何模板数据 (无 org 也无 platform)')
        return
      }
      this.form = {
        _id: row.org ? row.org._id : null,
        _isNewOrg: !row.org,
        type: row.type,
        channel: row.channel,
        title: src.title,
        body: src.body,
        wechatTemplateId: (row.org && row.org.wechatTemplateId) || '',
        smsTemplateCode: (row.org && row.org.smsTemplateCode) || '',
        isActive: row.org ? (row.org.isActive !== false) : true
      }
      this.dialogVisible = true
    },
    async onReset(row) {
      try {
        await ElMessageBox.confirm(
          `确定把「${row._trigger.triggerText}」（${row._trigger.recipientText}）重置为平台默认模板？\n\n您已修改的文案将被丢弃，操作不可撤销。`,
          '重置模板',
          {
            confirmButtonText: '确定重置',
            cancelButtonText: '取消',
            type: 'warning',
            confirmButtonClass: 'el-button--danger'
          }
        )
      } catch (e) {
        return
      }
      try {
        const r = await notificationApi.removeTemplate(row.type, row.channel)
        ElMessage.success(r && r.deleted ? '已重置为平台默认' : '已经是平台默认，无需重置')
        await this.load()
      } catch (e) {
        ElMessage.error(e.message || '重置失败')
      }
    },
    async onResetAll() {
      try {
        await ElMessageBox.confirm(
          '确定把本机构所有 7 条自定义模板都重置为平台默认吗？\n\n所有本机构已修改的标题 / 正文 / 启停用状态都将被丢弃，操作不可撤销。',
          '全部重置本机构模板',
          {
            confirmButtonText: '全部重置',
            cancelButtonText: '取消',
            type: 'warning',
            confirmButtonClass: 'el-button--danger'
          }
        )
      } catch (e) {
        return
      }
      this.resettingAll = true
      try {
        const r = await notificationApi.resetAllTemplates()
        ElMessage.success(`已重置 ${r.deleted || 0} 条模板为平台默认`)
        await this.load()
      } catch (e) {
        ElMessage.error(e.message || '批量重置失败')
      } finally {
        this.resettingAll = false
      }
    },
    onSave() {
      this.$refs.formRef.validate(async (valid) => {
        if (!valid) return
        this.saving = true
        try {
          // 本 UI 仅编辑本机构 org 模板 → R-4011
          await notificationApi.upsertTemplate(this.form.type, this.form.channel, {
            title: this.form.title,
            body: this.form.body,
            wechatTemplateId: this.form.wechatTemplateId || null,
            smsTemplateCode: this.form.smsTemplateCode || null,
            isActive: this.form.isActive
          })
          ElMessage.success('已保存')
          this.dialogVisible = false
          await this.load()
        } catch (e) {
          ElMessage.error(e.message || '保存失败')
        } finally {
          this.saving = false
        }
      })
    },
    onDialogClosed() {
      this.resetForm()
    }
  }
}
</script>

<style lang="scss" scoped>
.page-templates {
  padding: 16px;

  &__header {
    margin-bottom: 16px;
    h2 { margin: 0 0 4px; }
  }
  &__desc {
    color: #606266;
    font-size: 13px;
    line-height: 1.7;
    margin: 0 0 12px;
  }
  &__platform-hint {
    color: #909399;
    border-bottom: 1px dashed #909399;
    cursor: help;
  }
  &__toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  &__trigger {
    line-height: 1.4;
  }
  &__trigger-main {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 500;
  }
  &__trigger-type {
    color: #909399;
    font-size: 11px;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    margin-top: 2px;
  }
  &__recipient {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  &__recipient-emoji {
    font-size: 13px;
  }

  // 启用列 (v4 单开关, 无 chip)
  &__switch-cell {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__form-static {
    background: #f5f7fa;
    padding: 6px 10px;
    border-radius: 4px;
    color: #606266;
    font-size: 13px;
  }
  &__placeholders {
    line-height: 1.6;
  }
  &__placeholder {
    margin: 2px 4px;
  }
  &__hint {
    color: #909399;
    font-size: 12px;
    margin-top: 4px;
  }
}
</style>