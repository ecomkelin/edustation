<template>
  <el-card v-loading="loading">
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="160px"
      label-position="left"
    >
      <el-divider content-position="left">模型参数</el-divider>

      <el-form-item label="Temperature" prop="temperature">
        <template #label>
          <span>Temperature</span>
          <el-tooltip
            placement="top"
            effect="light"
            popper-class="agent-config-tip"
          >
            <template #content>
              <div class="tip-title">采样温度 (Sampling Temperature)</div>
              <div class="tip-body">
                控制模型生成时的随机性. 取值 0-2:
                <ul>
                  <li><b>接近 0</b>: 输出更确定、稳定, 适合事实查询 / 结构化指令</li>
                  <li><b>0.3 左右</b>: 默认值, 平衡稳定与自然</li>
                  <li><b>接近 1</b>: 更发散、有创造性, 适合文案/头脑风暴</li>
                  <li><b>&gt;1.5</b>: 容易跑偏, 不建议业务场景使用</li>
                </ul>
              </div>
            </template>
            <el-icon class="tip-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </template>
        <el-slider
          v-model="form.temperature"
          :min="0"
          :max="2"
          :step="0.1"
          show-input
          style="max-width: 480px"
        />
        <div class="form-hint">取值 0-2; 越低越确定, 越高越发散. 默认 0.3</div>
      </el-form-item>

      <el-form-item label="Max tokens" prop="maxTokens">
        <template #label>
          <span>Max tokens</span>
          <el-tooltip
            placement="top"
            effect="light"
            popper-class="agent-config-tip"
          >
            <template #content>
              <div class="tip-title">单次回复最大 token 数</div>
              <div class="tip-body">
                模型单次回复 (assistant message) 的长度上限, 1 token ≈ 1 个汉字或 0.75 个英文单词.
                <ul>
                  <li><b>256-1024</b>: 简短问答 / 单条指令</li>
                  <li><b>2048</b>: 默认值, 覆盖大部分业务场景</li>
                  <li><b>4096+</b>: 长报告 / 长说明, 成本与延迟更高</li>
                  <li><b>tool use + 多轮上下文</b>: 建议 ≥ 2048, 否则容易提前截断</li>
                </ul>
                <div class="tip-warn">⚠ 注意: 上限高不代表每次都用满, 实际回复长度由模型自主判断.</div>
              </div>
            </template>
            <el-icon class="tip-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </template>
        <el-input-number
          v-model="form.maxTokens"
          :min="256"
          :max="8000"
          :step="128"
        />
        <div class="form-hint">单次回复最大 token 数; tool use + 上下文累积建议 ≥ 2048</div>
      </el-form-item>

      <el-divider content-position="left">系统提示 (System Prompt)</el-divider>

      <el-form-item label="平台默认 prompt" prop="systemPrompt">
        <template #label>
          <span>平台默认 prompt</span>
          <el-tooltip
            placement="top"
            effect="light"
            popper-class="agent-config-tip"
          >
            <template #content>
              <div class="tip-title">系统提示 (System Prompt)</div>
              <div class="tip-body">
                注入到 LLM 上下文第一位的"角色设定", 优先级高于用户消息.
                <ul>
                  <li>定义 AI 身份 / 业务范围 / 输出格式</li>
                  <li>列出禁用操作 / 敏感词 / 合规约束</li>
                  <li>举例说明期望的回复风格</li>
                </ul>
                <div class="tip-warn">⚠ 留空 = 不注入额外 prompt, 模型按训练默认行为回答; 走 env 兜底 (如配置了 AI_SYSTEM_PROMPT).</div>
                <div class="tip-warn">📌 修改后所有用户下次对话立即生效 (chat pipeline 在每次请求时实时读取 AgentConfig).</div>
              </div>
            </template>
            <el-icon class="tip-icon"><QuestionFilled /></el-icon>
          </el-tooltip>
        </template>
        <el-input
          v-model="form.systemPrompt"
          type="textarea"
          :rows="14"
          placeholder="留空表示不注入额外 system prompt (走 env 兜底)"
        />
        <div class="form-hint">
          可空. 修改后所有用户下次对话立即生效 (chat pipeline 在每次请求时实时读取 AgentConfig).
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" :loading="submitting" @click="submit">保存</el-button>
        <el-button @click="load">重载</el-button>
      </el-form-item>
    </el-form>
  </el-card>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import { agentConfigApi } from '@/api/agentConfig'

const loading = ref(false)
const submitting = ref(false)
const formRef = ref()

const form = reactive({ systemPrompt: '', temperature: 0.3, maxTokens: 2048 })
const rules = {
  temperature: [{ required: true, message: '必填', trigger: 'blur' }],
  maxTokens: [{ required: true, message: '必填', trigger: 'blur' }]
}

async function load () {
  loading.value = true
  try {
    const { data } = await agentConfigApi.get()
    Object.assign(form, {
      systemPrompt: data.systemPrompt || '',
      temperature: data.temperature,
      maxTokens: data.maxTokens
    })
  } finally {
    loading.value = false
  }
}

async function submit () {
  if (!formRef.value) return
  try {
    await formRef.value.validate()
  } catch (_) {
    return
  }
  submitting.value = true
  try {
    await agentConfigApi.update({
      systemPrompt: form.systemPrompt,
      temperature: Number(form.temperature),
      maxTokens: Number(form.maxTokens)
    })
    ElMessage.success('已保存')
  } finally {
    submitting.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.form-hint {
  color: #909399;
  font-size: 12px;
  margin-top: 4px;
  line-height: 1.6;
}
/* label 旁的问号图标: 灰一档, 鼠标 hover 时变蓝 */
.tip-icon {
  margin-left: 4px;
  color: #909399;
  cursor: help;
  font-size: 14px;
  vertical-align: middle;
  transition: color 0.15s;
}
.tip-icon:hover {
  color: #409eff;
}
</style>

<!-- tooltip 弹出层样式 (popper-class 是全局类, 不能 scoped) -->
<style>
.agent-config-tip {
  max-width: 360px !important;
  line-height: 1.6;
  padding: 10px 12px !important;
}
.agent-config-tip .tip-title {
  font-weight: 600;
  font-size: 13px;
  color: #303133;
  margin-bottom: 6px;
}
.agent-config-tip .tip-body {
  font-size: 12px;
  color: #606266;
}
.agent-config-tip .tip-body ul {
  margin: 6px 0;
  padding-left: 18px;
}
.agent-config-tip .tip-body li {
  margin: 2px 0;
}
.agent-config-tip .tip-warn {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #ebeef5;
  color: #e6a23c;
  font-size: 11.5px;
}
.agent-config-tip .tip-warn:last-child {
  border-top: none;
}
</style>