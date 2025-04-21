<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { onMounted, ref } from 'vue'

// 所有成员
const members = ref<any[]>([])
window.mainAPI.getMemberOptions().then((options: any[]) => {
  members.value = options
})
const selectedMember = ref<any[]>([])

// 屏蔽成员
const hiddenMembers = ref<any[]>([])

onMounted(async () => {
  hiddenMembers.value = await window.mainAPI.getHiddenMembers()
  console.log('hiddenMembers', hiddenMembers.value)
})

function clear() {
  window.mainAPI.setHiddenMembers([])
}

async function addHiddenMember() {
  console.log(selectedMember.value)
  if (typeof selectedMember.value[2] === 'undefined') {
    ElMessage({
      message: '请选中需要屏蔽的成员',
      type: 'warning',
    })
    return
  }
  const exists = hiddenMembers.value.some((member: any) => member.userId == selectedMember.value[2])
  if (exists) {
    ElMessage({
      message: '请勿重复添加',
      type: 'warning',
    })
    return
  }
  const tempIds = Array.from(hiddenMembers.value.map((m: any) => m.userId))
  tempIds.push(selectedMember.value[2])
  window.mainAPI.setHiddenMembers(tempIds)
  console.log(tempIds)
  selectedMember.value = []
  hiddenMembers.value = await window.mainAPI.getHiddenMembers()
}

async function removeHidMember(memberId: number) {
  await window.mainAPI.removeHiddenMember(memberId)
  hiddenMembers.value = await window.mainAPI.getHiddenMembers()
}
</script>

<template>
  <div style="text-align: left;">
    <el-cascader
      v-model="selectedMember" style="width: 320px;" transfer placeholder="请选择成员" clearable filterable
      :options="members"
    />
    <el-button style="margin-left: 8px;" type="primary" @click="addHiddenMember">
      屏蔽
    </el-button>

    <el-button style="margin-left: 8px;" type="danger" @click="clear">
      清空
    </el-button>

    <div style="margin-top: 8px;">
      <el-tag
        v-for="member in hiddenMembers" :key="member.userId" closable
        :name="member.userId"
        :color="`#${member.team.teamColor}`"
        effect="dark"
        @close="removeHidMember(member.userId)"
      >
        {{ member.realName }}
      </el-tag>
    </div>
  </div>
</template>

<style lang="scss">
.el-tag {
  margin: 4px;
}

:deep(.--el-tag-text-color) {
  color: #fff !important;
}

:deep(.--el-tag__close) {
  color: #fff !important;
}
</style>
