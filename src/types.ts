export interface WebcamImage {
    imageId: number
    md5: string
    webcamCode: string
    newestForWebcam: string
    imageTimestamp: number
    imageDate: string
    isNighttimeInd: string
    interestingCode: string
    imageUrl: string
}

export interface WebcamInfo {
    webcamCode: string
    webcamName: string
    imageTotal: number
    firstImageTimestamp: number
    lastImageTimestamp: number
    currentImageUrl: string
}

export interface ApiResponse {
    images: WebcamImage[]
    webcam: WebcamInfo
    meta: {
        imageTotal: number
        firstImageTimestamp: number
        lastImageTimestamp: number
    }
}
