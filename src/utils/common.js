import { elementSelectors } from '@/shared/element-selectors'

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
export const detectivePageType = () => {
    const { host, pathname, origin } = window.location
    const pageStrategies = [
        {
            test: () => /^(\/video\/|\/bangumi\/)/.test(pathname),
            type: () => pathname.startsWith('/video') ? 'video' : 'bangumi'
        },
        {
            test: () => host === 'www.bilibili.com' && pathname === '/',
            type: () => 'index'
        },
        {
            test: () => origin === 'https://t.bilibili.com',
            type: () => 'dynamic'
        }
    ]

    const matchedStrategy = pageStrategies.find(strategy => strategy.test())
    return matchedStrategy ? matchedStrategy.type() : 'unknown'
}

export const isElementSizeChange = (el, callback) => {
    let lastWidth = el.offsetWidth
    let lastHeight = el.offsetHeight

    const resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
            if (entry.contentBoxSize) {
                const contentBoxSize = Array.isArray(entry.contentBoxSize)
                    ? entry.contentBoxSize[0]
                    : entry.contentBoxSize

                const newWidth = entry.target.offsetWidth
                const newHeight = entry.target.offsetHeight

                if (newWidth !== lastWidth || newHeight !== lastHeight) {
                    lastWidth = newWidth
                    lastHeight = newHeight
                    callback?.(true, { width: newWidth, height: newHeight })
                } else {
                    callback?.(false)
                }
            }
        }
    })

    resizeObserver.observe(el)
    return resizeObserver
}

export const isVideoCanplaythrough = videoElement => {
    return new Promise(resolve => {
        if (videoElement?.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
            return resolve(true)
        }

        const ac = new AbortController()

        const handler = () => {
            if (videoElement.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                ac.abort()
                resolve(true)
            }
        }

        const events = ['canplaythrough',
                        'loadeddata']
        events.forEach(event =>
            videoElement.addEventListener(event, handler, { signal: ac.signal })
        )

        const TIMEOUT = 5_000
        setTimeout(() => {
            ac.abort()
            resolve(false)
        }, TIMEOUT)
    })
}

export const isPlayerModeSwitchSuccess = async (selectedPlayerMode, videoElement) => {
    await sleep(300)
    const observer = isElementSizeChange(videoElement, async (changed, _) => {
        if (changed) {
            const playerContainer = await elementSelectors.playerContainer
            const currentPlayerMode = playerContainer.getAttribute('data-screen')
            if (currentPlayerMode === selectedPlayerMode) {
                observer.disconnect()
                return true
            }
        }
    })
}
