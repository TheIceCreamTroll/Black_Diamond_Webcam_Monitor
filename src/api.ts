import type { ApiResponse, WebcamImage } from './types'
import { WEBCAM_CODE, API_BASE } from './constants'

export async function fetchInterestingImages(
    limit: number = 50
): Promise<ApiResponse> {
    const url = `${API_BASE}/imageApi/interesting`
    console.log('[API] Fetching interesting images:', url)

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(
            `Failed to fetch interesting images: ${response.status} ${response.statusText}`
        )
    }

    const data = await response.json() as ApiResponse
    console.log(`[API] Fetched ${data.images?.length || 0} interesting images`)

    // Filter for our webcam and limit results
    if (data.images) {
        data.images = data.images
            .filter((img: WebcamImage) => img.webcamCode === WEBCAM_CODE)
            .slice(0, limit)
        console.log(
            `[API] Filtered to ${data.images.length} images for webcam ${WEBCAM_CODE}`
        )
    }

    return data
}

export async function fetchWebcamImagesByDays(
    days: number,
    limit: number = 50
): Promise<ApiResponse> {
    const url = `${API_BASE}/imageApi/webcam/${WEBCAM_CODE}/${days}/newestFirst/${limit}`
    console.log('Fetching images by days:', url)

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(
            `Failed to fetch images: ${response.status} ${response.statusText}`
        )
    }

    const data = await response.json() as ApiResponse
    console.log(
        `[API] Fetched ${data.images.length} images from last ${days} days`
    )
    console.log(
        '[API] Volcanic activity count:',
        data.images.filter((img) => img.interestingCode === 'V').length
    )
    console.log(
        '[API] Interesting codes distribution:',
        data.images.reduce(
            (acc, img) => {
                acc[img.interestingCode] = (acc[img.interestingCode] || 0) + 1
                return acc
            },
            {} as Record<string, number>
        )
    )
    return data
}

export async function fetchWebcamImagesByTimestamp(
    startTimestamp: number,
    endTimestamp: number,
    limit: number = 500,
    order: 'newestFirst' | 'oldestFirst' = 'newestFirst'
): Promise<ApiResponse> {
    const url = `${API_BASE}/imageApi/webcam/${WEBCAM_CODE}/${startTimestamp}/${endTimestamp}/${order}/${limit}`
    console.log('Fetching images by timestamp:', url)

    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(
            `Failed to fetch images: ${response.status} ${response.statusText}`
        )
    }

    const data = await response.json() as ApiResponse
    console.log(
        `[API] Fetched ${data.images.length} images (${new Date(startTimestamp * 1000).toLocaleString()} - ${new Date(endTimestamp * 1000).toLocaleString()})`
    )
    console.log(
        '[API] Volcanic activity count:',
        data.images.filter((img) => img.interestingCode === 'V').length
    )
    return data
}
