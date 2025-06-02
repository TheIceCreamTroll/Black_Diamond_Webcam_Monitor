import { useState, useEffect, useCallback, useMemo } from 'react'
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'

interface WebcamImage {
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

interface WebcamInfo {
  webcamCode: string
  webcamName: string
  imageTotal: number
  firstImageTimestamp: number
  lastImageTimestamp: number
  currentImageUrl: string
}

interface ApiResponse {
  images: WebcamImage[]
  webcam: WebcamInfo
  meta: {
    imageTotal: number
    firstImageTimestamp: number
    lastImageTimestamp: number
  }
}

const WEBCAM_CODE = 'ys-bbsn'
const API_BASE = 'https://volcview.wr.usgs.gov/ashcam-api'
const FIFTEEN_MINUTES = 15 * 60 * 1000

// API fetch functions
async function fetchInterestingImages(limit: number = 50): Promise<ApiResponse> {
  const url = `${API_BASE}/imageApi/interesting`
  console.log('[API] Fetching interesting images:', url)
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch interesting images: ${response.status} ${response.statusText}`)
  }
  
  const data = await response.json()
  console.log(`[API] Fetched ${data.images?.length || 0} interesting images`)
  
  // Filter for our webcam and limit results
  if (data.images) {
    data.images = data.images
      .filter((img: WebcamImage) => img.webcamCode === WEBCAM_CODE)
      .slice(0, limit)
    console.log(`[API] Filtered to ${data.images.length} images for webcam ${WEBCAM_CODE}`)
  }
  
  return data
}
async function fetchWebcamImagesByDays(days: number, limit: number = 50): Promise<ApiResponse> {
  const url = `${API_BASE}/imageApi/webcam/${WEBCAM_CODE}/${days}/newestFirst/${limit}`
  console.log('Fetching images by days:', url)
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch images: ${response.status} ${response.statusText}`)
  }
  
  const data: ApiResponse = await response.json()
  console.log(`[API] Fetched ${data.images.length} images from last ${days} days`)
  console.log('[API] Volcanic activity count:', data.images.filter(img => img.interestingCode === 'V').length)
  console.log('[API] Interesting codes distribution:', 
    data.images.reduce((acc, img) => {
      acc[img.interestingCode] = (acc[img.interestingCode] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  )
  return data
}

async function fetchWebcamImagesByTimestamp(
  startTimestamp: number,
  endTimestamp: number,
  limit: number = 500,
  order: 'newestFirst' | 'oldestFirst' = 'newestFirst'
): Promise<ApiResponse> {
  const url = `${API_BASE}/imageApi/webcam/${WEBCAM_CODE}/${startTimestamp}/${endTimestamp}/${order}/${limit}`
  console.log('Fetching images by timestamp:', url)
  
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch images: ${response.status} ${response.statusText}`)
  }
  
  const data: ApiResponse = await response.json()
  console.log(`[API] Fetched ${data.images.length} images (${new Date(startTimestamp * 1000).toLocaleString()} - ${new Date(endTimestamp * 1000).toLocaleString()})`)
  console.log('[API] Volcanic activity count:', data.images.filter(img => img.interestingCode === 'V').length)
  return data
}

function App() {
  const queryClient = useQueryClient()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showToast, setShowToast] = useState(false)
  const [toastMessage, setToastMessage] = useState('')
  const [inputLoadCount, setInputLoadCount] = useState(50)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [showInterestingOnly, setShowInterestingOnly] = useState(false)
  const [webcamInfo, setWebcamInfo] = useState<WebcamInfo | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [showJumpModal, setShowJumpModal] = useState(false)
  const [jumpToImage, setJumpToImage] = useState('')
  const [isJumping, setIsJumping] = useState(false)
  const [showMissingModal, setShowMissingModal] = useState(false)

  // Initial load - last 3 days
  const { 
    data: initialData, 
    isLoading, 
    error,
    refetch: refetchInitial 
  } = useQuery({
    queryKey: ['volcanic-images-initial'],
    queryFn: () => fetchWebcamImagesByDays(3, 50),
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    staleTime: 5 * 60 * 1000,
  })

  // Infinite query for pagination
  const {
    data: paginatedData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['volcanic-images-paginated'],
    initialPageParam: initialData?.images[initialData.images.length - 1]?.imageTimestamp,
    queryFn: ({ pageParam }) => {
      if (!pageParam) return Promise.resolve({ images: [], webcam: webcamInfo!, meta: { imageTotal: 0, firstImageTimestamp: 0, lastImageTimestamp: 0 } })
      return fetchWebcamImagesByTimestamp(0, pageParam - 1, inputLoadCount, 'newestFirst')
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.images.length === 0) return undefined
      return lastPage.images[lastPage.images.length - 1].imageTimestamp
    },
    enabled: !!initialData,
  })

  // Auto-refresh for new images when viewing latest
  useQuery({
    queryKey: ['volcanic-images-new', initialData?.images[0]?.imageTimestamp],
    queryFn: async () => {
      if (!initialData?.images[0]) return []
      const latestTimestamp = initialData.images[0].imageTimestamp
      const data = await fetchWebcamImagesByTimestamp(latestTimestamp + 1, Math.floor(Date.now() / 1000), 10)
      
      if (data.images.length > 0) {
        setToastMessage(`${data.images.length} new image${data.images.length > 1 ? 's' : ''} available!`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
        
        // Update the initial data cache
        queryClient.setQueryData(['volcanic-images-initial'], (old: ApiResponse) => ({
          ...old,
          images: [...data.images, ...old.images].slice(0, 100), // Keep max 100 in initial
        }))
      }
      return data.images
    },
    enabled: currentIndex === 0 && !!initialData,
    refetchInterval: 15 * 60 * 1000, // 15 minutes
  })

  // Combine all images
  const allImages = useMemo(() => {
    const images = [...(initialData?.images || [])]
    
    if (paginatedData) {
      paginatedData.pages.forEach(page => {
        images.push(...page.images)
      })
    }
    
    // Remove duplicates
    const uniqueImages = Array.from(new Map(images.map(img => [img.imageId, img])).values())
    
    // Sort by timestamp descending (newest first)
    uniqueImages.sort((a, b) => b.imageTimestamp - a.imageTimestamp)
    
    return uniqueImages
  }, [initialData, paginatedData])

  // Filter images if needed
  const displayImages = useMemo(() => {
    console.log('[Filter] showInterestingOnly:', showInterestingOnly)
    console.log('[Filter] allImages count:', allImages.length)
    
    if (!showInterestingOnly) {
      console.log('[Filter] Returning all images')
      return allImages
    }
    
    const filtered = allImages.filter(img => img.interestingCode === 'V')
    console.log('[Filter] Filtered to volcanic activity, count:', filtered.length)
    console.log('[Filter] Sample of interesting codes:', allImages.slice(0, 10).map(img => ({ 
      id: img.imageId, 
      code: img.interestingCode,
      timestamp: new Date(img.imageTimestamp * 1000).toLocaleString()
    })))
    
    return filtered
  }, [allImages, showInterestingOnly])

  // Update webcam info
  useEffect(() => {
    if (initialData?.webcam) {
      setWebcamInfo(initialData.webcam)
    }
  }, [initialData])

  // Calculate missing image timestamps first
  const missingImageTimestamps = useMemo(() => {
    if (displayImages.length < 2) return []
    
    const missingTimes: { timestamp: number; date: Date }[] = []
    const existingTimestamps = new Set(displayImages.map(img => img.imageTimestamp))
    
    // Get the first and last timestamps
    const firstTimestamp = displayImages[displayImages.length - 1].imageTimestamp
    const lastTimestamp = displayImages[0].imageTimestamp
    
    // Generate all expected timestamps (every 15 minutes)
    for (let ts = firstTimestamp; ts <= lastTimestamp; ts += 900) { // 900 seconds = 15 minutes
      if (!existingTimestamps.has(ts)) {
        // Check if there's an image within 1 minute of this timestamp
        let found = false
        for (let offset = -60; offset <= 60; offset += 1) {
          if (existingTimestamps.has(ts + offset)) {
            found = true
            break
          }
        }
        
        if (!found) {
          missingTimes.push({
            timestamp: ts,
            date: new Date(ts * 1000)
          })
        }
      }
    }
    
    // Sort by timestamp descending (newest first)
    missingTimes.sort((a, b) => b.timestamp - a.timestamp)
    
    return missingTimes
  }, [displayImages])

  // Calculate expected vs actual images based on missing timestamps
  const imageStats = useMemo(() => {
    if (displayImages.length < 2) return null
    
    const firstTimestamp = displayImages[displayImages.length - 1].imageTimestamp
    const lastTimestamp = displayImages[0].imageTimestamp
    const timeDiff = (lastTimestamp - firstTimestamp) * 1000
    const expectedImages = Math.floor(timeDiff / FIFTEEN_MINUTES) + 1
    const actualMissing = missingImageTimestamps.length
    
    return {
      expected: expectedImages,
      actual: displayImages.length,
      missing: actualMissing,
      coverage: ((displayImages.length / expectedImages) * 100).toFixed(1)
    }
  }, [displayImages, missingImageTimestamps])

  const currentImage = displayImages[currentIndex]
  
  // Log current image state
  useEffect(() => {
    console.log('[Current Image] Index:', currentIndex)
    console.log('[Current Image] Display images count:', displayImages.length)
    console.log('[Current Image] Current image:', currentImage ? {
      id: currentImage.imageId,
      interestingCode: currentImage.interestingCode,
      timestamp: new Date(currentImage.imageTimestamp * 1000).toLocaleString()
    } : 'No image')
  }, [currentIndex, displayImages.length, currentImage])


  const handleLoadMore = useCallback(() => {
    fetchNextPage()
  }, [fetchNextPage])

  const handleDateSubmit = async () => {
    if (!startDate) return
    
    let startTimestamp = Math.floor(new Date(startDate).getTime() / 1000)
    const endTimestamp = Math.floor(Date.now() / 1000)
    
    // Validate date is not before earliest available
    if (webcamInfo && startTimestamp < webcamInfo.firstImageTimestamp) {
      const earliestDate = new Date(webcamInfo.firstImageTimestamp * 1000)
      const userConfirm = confirm(
        `The selected date is before the earliest available image (${earliestDate.toLocaleDateString()}). ` +
        `Would you like to load from the earliest date instead?`
      )
      
      if (userConfirm) {
        startTimestamp = webcamInfo.firstImageTimestamp
      } else {
        return // User cancelled
      }
    }
    
    try {
      const data = await fetchWebcamImagesByTimestamp(startTimestamp, endTimestamp, 99999)
      
      if (data.images.length > 0) {
        // Replace initial data with date range data
        queryClient.setQueryData(['volcanic-images-initial'], data)
        setCurrentIndex(0)
        setShowDatePicker(false)
        setStartDate('')
        setToastMessage(`Loaded ${data.images.length} images from ${new Date(startTimestamp * 1000).toLocaleDateString()}`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
      } else {
        alert('No images found since the selected date')
      }
    } catch (err) {
      console.error('Error loading images:', err)
      alert('Error loading images from the selected date')
    }
  }

  const handleRefresh = () => {
    setRetryCount(prev => prev + 1)
    refetchInitial()
  }

  const handleJumpToImage = async () => {
    const imageNumber = parseInt(jumpToImage)
    const totalImages = webcamInfo?.imageTotal || displayImages.length
    
    if (!imageNumber || imageNumber < 1 || imageNumber > totalImages) {
      return
    }

    setIsJumping(true)

    try {
      // Check if the image is already loaded
      if (imageNumber <= displayImages.length) {
        setCurrentIndex(imageNumber - 1)
        setShowJumpModal(false)
        setJumpToImage('')
        setIsJumping(false)
        return
      }

      // Need to fetch more images
      // Calculate how many images we need to load
      const imagesToLoad = imageNumber - displayImages.length + 100 // Load extra for buffer
      
      // Fetch all images from the beginning
      const endTimestamp = Math.floor(Date.now() / 1000)
      const data = await fetchWebcamImagesByTimestamp(0, endTimestamp, Math.min(imagesToLoad, totalImages), 'newestFirst')
      
      if (data.images.length >= imageNumber) {
        // Replace the initial data with all loaded images
        queryClient.setQueryData(['volcanic-images-initial'], data)
        
        // Clear pagination data since we're resetting
        queryClient.resetQueries({ queryKey: ['volcanic-images-paginated'] })
        
        // Set the index after data is loaded
        setTimeout(() => {
          setCurrentIndex(imageNumber - 1)
        }, 100)
        
        setToastMessage(`Loaded ${data.images.length} images`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
      } else {
        setToastMessage(`Could not load image ${imageNumber}. Only ${data.images.length} images available.`)
        setShowToast(true)
        setTimeout(() => setShowToast(false), 5000)
      }
      
      setShowJumpModal(false)
      setJumpToImage('')
    } catch (err) {
      console.error('Error jumping to image:', err)
      setToastMessage('Error loading images')
      setShowToast(true)
      setTimeout(() => setShowToast(false), 5000)
    } finally {
      setIsJumping(false)
    }
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card bg-base-200 shadow-xl p-8 max-w-md">
          <h2 className="text-xl font-bold mb-4">Error Loading Images</h2>
          <p className="mb-4">{error.message}</p>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={handleRefresh}>
              Retry (Attempt {retryCount + 1})
            </button>
            <button className="btn btn-ghost" onClick={() => window.location.reload()}>
              Reload Page
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-base-100 p-4">
      {showToast && (
        <div className="toast toast-top toast-center">
          <div className="alert alert-success">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-center mb-6">
          {webcamInfo?.webcamName} Webcam
        </h1>

        {isLoading ? (
          <div className="space-y-4">
            <div className="skeleton h-96 w-full"></div>
            <div className="skeleton h-12 w-full"></div>
          </div>
        ) : (
          <>
            {displayImages.length === 0 && showInterestingOnly ? (
              <div className="card bg-base-200 shadow-xl p-8 text-center">
                <h2 className="text-xl font-bold mb-4">No Volcanic Activity Images Found</h2>
                <p className="mb-4">There are no images marked with volcanic activity in the current dataset.</p>
                <div className="flex gap-4 justify-center">
                  <button 
                    className="btn btn-primary"
                    onClick={() => {
                      console.log('[No Images] Disabling volcanic activity filter')
                      setShowInterestingOnly(false)
                      setCurrentIndex(0)
                    }}
                  >
                    Show All Images
                  </button>
                  <button 
                    className="btn btn-secondary"
                    onClick={async () => {
                      console.log('[No Images] Loading interesting images from API')
                      try {
                        const data = await fetchInterestingImages(100)
                        if (data.images && data.images.length > 0) {
                          queryClient.setQueryData(['volcanic-images-initial'], data)
                          setToastMessage(`Loaded ${data.images.length} images with volcanic activity`)
                          setShowToast(true)
                          setTimeout(() => setShowToast(false), 5000)
                        } else {
                          setToastMessage('No volcanic activity images found for this webcam')
                          setShowToast(true)
                          setTimeout(() => setShowToast(false), 5000)
                        }
                      } catch (err) {
                        console.error('[No Images] Error loading interesting images:', err)
                        setToastMessage('Error loading volcanic activity images')
                        setShowToast(true)
                        setTimeout(() => setShowToast(false), 5000)
                      }
                    }}
                  >
                    Load Volcanic Activity Images
                  </button>
                </div>
              </div>
            ) : currentImage ? (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    key={currentImage.imageId}
                    src={currentImage.imageUrl}
                    alt={webcamInfo?.webcamName}
                    className="w-full h-auto rounded-lg shadow-lg"
                  />
                  <div className="absolute top-4 right-4 flex gap-2">
                    {currentImage.interestingCode === 'V' && (
                      <div className="badge badge-warning">🌋 Volcanic Activity</div>
                    )}
                    <div className="badge badge-neutral">
                      {currentImage.isNighttimeInd === 'Y' ? '🌙 Night' : '☀️ Day'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <button
                      onClick={() => setShowDatePicker(true)}
                      className="btn btn-sm btn-ghost text-left"
                    >
                      <div>
                        <p className="text-sm text-base-content/70">
                          {new Date(currentImage.imageTimestamp * 1000).toLocaleString('en-US', { 
                            timeZone: 'America/Denver',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })} MT
                        </p>
                        <p className="text-sm text-base-content/50">
                          {formatDistanceToNow(new Date(currentImage.imageTimestamp * 1000), { addSuffix: true })}
                        </p>
                      </div>
                    </button>
                  </div>
                  <div className="text-right">
                    <button
                      onClick={() => setShowJumpModal(true)}
                      className="btn btn-sm btn-ghost"
                    >
                      <span className="text-sm text-base-content/70">
                        Image {currentIndex + 1} of {displayImages.length}
                      </span>
                    </button>
                    {webcamInfo && (
                      <div className="text-xs text-base-content/50">
                        Total available: {webcamInfo.imageTotal.toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>

                {imageStats && (
                  <div className="stats stats-horizontal shadow bg-base-200">
                    <div className="stat px-4 py-2">
                      <div className="stat-title text-xs">Coverage</div>
                      <div className="stat-value text-lg">{imageStats.coverage}%</div>
                    </div>
                    <div className="stat px-4 py-2">
                      <div className="stat-title text-xs">Expected</div>
                      <div className="stat-value text-lg">{imageStats.expected}</div>
                    </div>
                    <div 
                      className="stat px-4 py-2 cursor-pointer hover:bg-base-300 transition-colors"
                      onClick={() => imageStats.missing > 0 && setShowMissingModal(true)}
                    >
                      <div className="stat-title text-xs">Missing</div>
                      <div className="stat-value text-lg">{imageStats.missing}</div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <button
                      className="btn btn-circle"
                      onClick={() => setCurrentIndex(Math.min(displayImages.length - 1, currentIndex + 1))}
                      disabled={currentIndex === displayImages.length - 1}
                    >
                      ←
                    </button>
                    
                    <input
                      type="range"
                      min={0}
                      max={displayImages.length - 1}
                      value={displayImages.length - 1 - currentIndex}
                      onChange={(e) => setCurrentIndex(displayImages.length - 1 - parseInt(e.target.value))}
                      className="range range-primary flex-1"
                    />
                    
                    <button
                      className="btn btn-circle"
                      onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                      disabled={currentIndex === 0}
                    >
                      →
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 items-center">
                    <div className="form-control">
                      <label className="label cursor-pointer gap-2">
                        <span className="label-text">Show only volcanic activity</span>
                        <input 
                          type="checkbox" 
                          className="toggle toggle-primary"
                          checked={showInterestingOnly}
                          onChange={(e) => {
                            console.log('[Toggle] Volcanic activity filter changed to:', e.target.checked)
                            setShowInterestingOnly(e.target.checked)
                            setCurrentIndex(0)
                          }}
                        />
                      </label>
                    </div>

                    {hasNextPage && (
                      <div className="flex items-center gap-4">
                        <input
                          type="number"
                          min="1"
                          max="500"
                          value={inputLoadCount}
                          onChange={(e) => setInputLoadCount(parseInt(e.target.value) || 50)}
                          className="input input-bordered w-24 text-center"
                        />
                        <button
                          className="btn btn-primary"
                          onClick={handleLoadMore}
                          disabled={isFetchingNextPage}
                        >
                          {isFetchingNextPage ? (
                            <>
                              <span className="loading loading-spinner loading-sm"></span>
                              Loading...
                            </>
                          ) : (
                            `Load ${inputLoadCount} More`
                          )}
                        </button>
                      </div>
                    )}
                    
                    <span className="text-sm text-base-content/70">
                      Currently showing {displayImages.length} images
                      {showInterestingOnly && ` (${allImages.length} total)`}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {showDatePicker && (
        <div className="modal modal-open">
          <div className="modal-box max-w-md">
            <h3 className="font-bold text-2xl mb-2">Load Images From Date</h3>
            <p className="text-base-content/70 mb-6">Load all images from this date to present</p>
            <div className="form-control">
              <label className="label">
                <span className="label-text text-base font-medium">Start Date/Time</span>
              </label>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input input-bordered w-full"
                max={new Date().toISOString().slice(0, 16)}
                min={webcamInfo ? new Date(webcamInfo.firstImageTimestamp * 1000).toISOString().slice(0, 16) : undefined}
              />
              {webcamInfo && (
                <label className="label">
                  <span className="label-text-alt">
                    Earliest: {new Date(webcamInfo.firstImageTimestamp * 1000).toLocaleDateString()}
                  </span>
                </label>
              )}
            </div>
            <div className="modal-action mt-8">
              <button className="btn btn-ghost" onClick={() => {
                setShowDatePicker(false)
                setStartDate('')
              }}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleDateSubmit}
                disabled={!startDate}
              >
                Load Images
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => {
            setShowDatePicker(false)
            setStartDate('')
          }}></div>
        </div>
      )}

      {showJumpModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-sm">
            <h3 className="font-bold text-2xl mb-2">Jump to Image</h3>
            <p className="text-base-content/70 mb-6">
              Enter image number (1-{webcamInfo?.imageTotal.toLocaleString() || displayImages.length})
            </p>
            <div className="form-control">
              <input
                type="number"
                value={jumpToImage}
                onChange={(e) => setJumpToImage(e.target.value)}
                className="input input-bordered w-full text-center text-lg"
                placeholder={`1-${webcamInfo?.imageTotal || displayImages.length}`}
                min="1"
                max={(webcamInfo?.imageTotal || displayImages.length).toString()}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleJumpToImage()
                  }
                }}
              />
              {displayImages.length < (webcamInfo?.imageTotal || 0) && (
                <label className="label">
                  <span className="label-text-alt">
                    Currently loaded: {displayImages.length.toLocaleString()} images
                  </span>
                </label>
              )}
            </div>
            <div className="modal-action mt-8">
              <button className="btn btn-ghost" onClick={() => {
                setShowJumpModal(false)
                setJumpToImage('')
              }}>
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleJumpToImage}
                disabled={!jumpToImage || parseInt(jumpToImage) < 1 || parseInt(jumpToImage) > (webcamInfo?.imageTotal || displayImages.length) || isJumping}
              >
                {isJumping ? (
                  <>
                    <span className="loading loading-spinner loading-sm"></span>
                    Loading...
                  </>
                ) : (
                  'Jump'
                )}
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => {
            setShowJumpModal(false)
            setJumpToImage('')
          }}></div>
        </div>
      )}

      {showMissingModal && (
        <div className="modal modal-open">
          <div className="modal-box max-w-2xl max-h-[80vh]">
            <h3 className="font-bold text-2xl mb-2">Missing Images</h3>
            <p className="text-base-content/70 mb-4">
              {missingImageTimestamps.length} images are missing from the expected 15-minute intervals
            </p>
            
            <div className="overflow-y-auto max-h-[50vh]">
              {missingImageTimestamps.length > 0 ? (
                <div className="space-y-2">
                  {missingImageTimestamps.map((missing, index) => (
                    <div key={missing.timestamp} className="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                      <div>
                        <div className="font-medium">
                          {missing.date.toLocaleString('en-US', { 
                            timeZone: 'America/Denver',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })} MT
                        </div>
                        <div className="text-sm text-base-content/60">
                          {formatDistanceToNow(missing.date, { addSuffix: true })}
                        </div>
                      </div>
                      <div className="text-sm text-base-content/50">
                        #{index + 1}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-8 text-base-content/60">
                  No missing images detected
                </p>
              )}
            </div>
            
            <div className="modal-action mt-6">
              <button 
                className="btn btn-primary" 
                onClick={() => setShowMissingModal(false)}
              >
                Close
              </button>
            </div>
          </div>
          <div className="modal-backdrop" onClick={() => setShowMissingModal(false)}></div>
        </div>
      )}
    </div>
  )
}

export default App