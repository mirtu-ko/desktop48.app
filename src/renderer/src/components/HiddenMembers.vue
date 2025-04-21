<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { computed, ref } from 'vue'
import { mutations, store } from '../assets/js/store'

// 所有成员
const members = ref<any[]>([])
window.mainAPI.getMemberOptions().then((options: any[]) => {
  members.value = options
})
const selectedMember = ref<any[]>([])

const hiddenMembers = computed(() => {
  const membersList: any[] = store.hiddenMemberIds.map((memberId: number) => {
    return window.mainAPI.getMember(memberId).then((member: any) => {
      member.team = window.mainAPI.getTeam(member.teamId).then((team: any) => {
        team.teamColor = team.teamColor == '' ? '#409eff' : `#${team.teamColor}`
        return team
      })
      return member
    })
  })
  return Promise.all(membersList)
})

function clear() {
  mutations.setHiddenMemberIds([])
  window.mainAPI.setHiddenMembers([])
}

function addHiddenMember() {
  if (typeof selectedMember.value[2] === 'undefined') {
    ElMessage({
      message: '请选中需要屏蔽的成员',
      type: 'warning',
    })
    return
  }
  const exists = store.hiddenMemberIds.some((memberId: number) => memberId == selectedMember.value[2])
  if (exists) {
    ElMessage({
      message: '请勿重复添加',
      type: 'warning',
    })
    return
  }
  const member: any = window.mainAPI.getMember(selectedMember.value[2]).then((member: any) => {
    member.team = window.mainAPI.getTeam(member.teamId).then((team: any) => {
      team.teamColor = team.teamColor == '' ? '#409eff' : `#${team.teamColor}`
      return team
    })
    return member
  })
  const tempIds = Array.from(store.hiddenMemberIds)
  tempIds.push(member.userId)
  mutations.setHiddenMemberIds(tempIds)
  window.mainAPI.setHiddenMembers(tempIds)
  selectedMember.value = []
}

function removeHiddenMember(memberId: number) {
  mutations.setHiddenMemberIds(store.hiddenMemberIds.filter((item: number) => item != memberId))
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
        v-for="member in hiddenMembers" :key="member.userId"
        :style="{ color: 'white', borderColor: member.team.teamColor, marginRight: '8px' }" :name="member.userId"
        closable :color="member.team.teamColor" @close="removeHiddenMember(member.userId)"
      >
        {{ member.realName }}
      </el-tag>
    </div>
  </div>
</template>

<style lang="scss">
.el-icon-close:before {
  color: #fff !important;
}

.el-tag {
  --el-tag__close {
    color: #fff !important;
  }
}
</style>
