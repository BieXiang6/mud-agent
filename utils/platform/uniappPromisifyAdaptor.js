// uni-app Vue 2 Promise 返回值兼容。仅由 uni-app 入口按条件加载。
uni.addInterceptor({
  returnValue(res) {
    if (!(res && (typeof res === 'object' || typeof res === 'function') && typeof res.then === 'function')) {
      return res
    }
    return new Promise((resolve, reject) => {
      res.then((value) => {
        if (!value) return resolve(value)
        return value[0] ? reject(value[0]) : resolve(value[1])
      })
    })
  }
})
