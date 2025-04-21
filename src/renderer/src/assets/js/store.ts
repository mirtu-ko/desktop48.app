// import Database removed, use window.mainAPI instead
import { reactive } from 'vue'

export const store: any = reactive({
  hiddenMemberIds: [],
  memberOptions: [],
  teamOptions: [],
  groupOptions: [],
})

export async function initStoreFromDB() {
  store.hiddenMemberIds = await window.mainAPI.getHiddenMembers()
  store.memberOptions = await window.mainAPI.getMemberOptions()
  store.teamOptions = await window.mainAPI.getTeamOptions()
  store.groupOptions = await window.mainAPI.getGroupOptions()
}

export const mutations: any = {
  async setHiddenMemberIds(newValue: []) {
    store.hiddenMemberIds = newValue
    await window.mainAPI.setHiddenMembers(newValue)
  },
  setMemberOptions(newValue: []) {
    store.memberOptions = newValue
  },
  setTeamOptions(newValue: []) {
    store.teamOptions = newValue
  },
  setGroupOptions(newValue: []) {
    store.groupOptions = newValue
  },
}
