import { useState, useEffect, useRef } from "react"
import { AzureCommunicationTokenCredential, CommunicationUserKind, CommunicationParticipant, CommunicationParticipantLocal } from "@azure/communication-common"
import { CallAgent, CallClient, VideoStreamRenderer, LocalVideoStream } from "@azure/communication-calling"

function App() {
  const [userAccessToken, setUserAccessToken] = useState("")
  const [calleeAcsUserId, setCalleeAcsUserId] = useState("")
  const [callAgent, setCallAgent] = useState(null)
  const [deviceManager, setDeviceManager] = useState(null)
  const [call, setCall] = useState(null)
  const [incomingCall, setIncomingCall] = useState(null)
  const [localVideoStreamState, setLocalVideoStreamState] = useState(null)

  const remoteVideosGalleryRef = useRef(null)
  const localVideoContainerRef = useRef(null)
  const connectedLabelRef = useRef(null)

  // Refs for buttons
  const initializeCallAgentButtonRef = useRef(null)
  const startCallButtonRef = useRef(null)
  const hangUpCallButtonRef = useRef(null)
  const acceptCallButtonRef = useRef(null)
  const startVideoButtonRef = useRef(null)
  const stopVideoButtonRef = useRef(null)

  useEffect(() => {
    const initialize = async () => {
      try {
        // Ensure that userAccessToken is not empty before initializing the call agent
        if (userAccessToken) {
          await initializeCallAgent()
        } else {
          console.error("Invalid user access token. Please provide a user access token.")
        }

        // Ensure that localVideoStreamState is not null before attempting to display
        if (localVideoStreamState) {
          await displayLocalVideoStream()

          // Define the cleanup function for when the component unmounts or when localVideoStreamState changes
          return () => {
            console.log("Cleaning up local video stream...")
            removeLocalVideoStream()
          }
        }
      } catch (error) {
        console.error("Error initializing or displaying video stream:", error)
      }
    }

    // Call the initialize function
    initialize()
  }, [localVideoStreamState, userAccessToken])

  useEffect(() => {
    if (callAgent) {
      callAgent.dispose()
    }
  }, [])

  const initializeCallAgent = async () => {
    try {
      // Check if a valid callee ID is provided
      if (!userAccessToken) {
        console.error("Invalid user access token. Please provide a user access token.")
        return
      }

      if (!callAgent) {
        // create call client instance
        const callClient = new CallClient()
        // generate token credential using user access token
        const tokenCredential = new AzureCommunicationTokenCredential(userAccessToken)
        // console.log("Token Credential Created Successfully:", tokenCredential)
        // create a new call agent instance using user access token
        const newCallAgent = await callClient.createCallAgent(tokenCredential)
        // console.log("Call Agent Created Successfully:", newCallAgent)
        // access device manager to gain camera and mic permissions
        const newDeviceManager = await callClient.getDeviceManager()
        await newDeviceManager.askDevicePermission({ video: true })
        await newDeviceManager.askDevicePermission({ audio: true })
        // update call agent and device manager states
        setCallAgent(newCallAgent)
        setDeviceManager(newDeviceManager)

        // subscribe to incoming calls
        newCallAgent.on("incomingCall", async (args) => {
          try {
            // update incoming call
            const newIncomingCall = args.incomingCall
            setIncomingCall(newIncomingCall)
            // update button states
            acceptCallButtonRef.current.disabled = false
            startCallButtonRef.current.disabled = true
          } catch (error) {
            console.error(error)
          }
        })

        // update button states
        startCallButtonRef.current.disabled = false
        initializeCallAgentButtonRef.current.disabled = true
        console.log("Call Agent Initialized Successfully.")
      }
    } catch (error) {
      console.error("Error Initializing Call Agent")
      console.error(error.stack)
    }
  }

  const startCall = async () => {
    try {
      console.log("Starting call...")

      if (!calleeAcsUserId) {
        console.error("Invalid callee ID. Please provide a valid ID.")
        return
      }

      if (callAgent) {
        // Dispose of the previous local video stream before creating a new one
        if (localVideoStreamState) {
          localVideoStreamState.dispose()
          setLocalVideoStreamState(null)
        }

        const newLocalVideoStream = await createLocalVideoStream()
        setLocalVideoStreamState(newLocalVideoStream)

        const videoOptions = newLocalVideoStream ? { localVideoStreams: [newLocalVideoStream] } : undefined
        const newCall = callAgent.startCall([{ communicationUserId: calleeAcsUserId }], { videoOptions })

        setCall(newCall)
        subscribeToCall(newCall)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const acceptIncomingCall = async () => {
    try {
      if (callAgent) {
        // Dispose of the previous local video stream before creating a new one
        if (localVideoStreamState) {
          localVideoStreamState.dispose()
          setLocalVideoStreamState(null)
        }

        const newLocalVideoStream = await createLocalVideoStream()
        setLocalVideoStreamState(newLocalVideoStream)

        const videoOptions = newLocalVideoStream ? { localVideoStreams: [newLocalVideoStream] } : undefined
        const acceptedCall = await incomingCall.accept({ videoOptions })

        setCall(acceptedCall)
        subscribeToCall(acceptedCall)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const subscribeToCall = (currentCall) => {
    try {
      if (!currentCall) {
        console.error("Current call is null.")
        return
      }
      // Inspect the initial call.id value.
      console.log(`Call Id: ${currentCall.id}`)
      //Subscribe to call's 'idChanged' event for value changes.
      currentCall.on("idChanged", () => {
        console.log(`Call Id changed: ${currentCall.id}`)
      })

      // Inspect the initial call.state value.
      console.log(`Call state: ${currentCall.state}`)
      // Subscribe to call's 'stateChanged' event for value changes.
      currentCall.on("stateChanged", async () => {
        console.log(`Call state changed: ${currentCall.state}`)
        if (currentCall.state === "Connected") {
          connectedLabelRef.current.hidden = false
          acceptCallButtonRef.current.disabled = true
          startCallButtonRef.current.disabled = true
          hangUpCallButtonRef.current.disabled = false
          startVideoButtonRef.current.disabled = false
          stopVideoButtonRef.current.disabled = false
          remoteVideosGalleryRef.current.hidden = false
        } else if (currentCall.state === "Disconnected") {
          connectedLabelRef.current.hidden = true
          startCallButtonRef.current.disabled = false
          hangUpCallButtonRef.current.disabled = true
          startVideoButtonRef.current.disabled = true
          stopVideoButtonRef.current.disabled = true
          console.log(`Call ended, call end reason={code=${currentCall.callEndReason.code}, subCode=${currentCall.callEndReason.subCode}}`)
        }
      })

      currentCall.on("isLocalVideoStartedChanged", () => {
        if (currentCall) {
          console.log(`isLocalVideoStarted changed: ${currentCall.isLocalVideoStarted}`)
        }
      })
      if (currentCall) {
        console.log(`isLocalVideoStarted: ${currentCall.isLocalVideoStarted}`)
      }
      currentCall.localVideoStreams.forEach(async (lvs) => {
        setLocalVideoStreamState(lvs)
        await displayLocalVideoStream()
      })
      currentCall.on("localVideoStreamsUpdated", (e) => {
        e.added.forEach(async (lvs) => {
          setLocalVideoStreamState(lvs)
          await displayLocalVideoStream()
        })
        e.removed.forEach((lvs) => {
          removeLocalVideoStream()
        })
      })

      // Inspect the call's current remote participants and subscribe to them.
      currentCall.remoteParticipants.forEach((remoteParticipant) => {
        subscribeToRemoteParticipant(remoteParticipant)
      })
      // Subscribe to the call's 'remoteParticipantsUpdated' event to be
      // notified when new participants are added to the call or removed from the call.
      currentCall.on("remoteParticipantsUpdated", (e) => {
        // Subscribe to new remote participants that are added to the call.
        e.added.forEach((remoteParticipant) => {
          subscribeToRemoteParticipant(remoteParticipant)
        })
        // Unsubscribe from participants that are removed from the call
        e.removed.forEach((remoteParticipant) => {
          console.log("Remote participant removed from the call.")
        })
      })
    } catch (error) {
      console.error(error)
    }
  }

  const subscribeToRemoteParticipant = (remoteParticipant) => {
    try {
      // Inspect the initial remoteParticipant.state value.
      console.log(`Remote participant state: ${remoteParticipant.state}`)
      // Subscribe to remoteParticipant's 'stateChanged' event for value changes.
      remoteParticipant.on("stateChanged", () => {
        console.log(`Remote participant state changed: ${remoteParticipant.state}`)
      })

      // Inspect the remoteParticipants's current videoStreams and subscribe to them.
      remoteParticipant.videoStreams.forEach((remoteVideoStream) => {
        subscribeToRemoteVideoStream(remoteVideoStream)
      })
      // Subscribe to the remoteParticipant's 'videoStreamsUpdated' event to be
      // notified when the remoteParticiapant adds new videoStreams and removes video streams.
      remoteParticipant.on("videoStreamsUpdated", (e) => {
        // Subscribe to new remote participant's video streams that were added.
        e.added.forEach((remoteVideoStream) => {
          subscribeToRemoteVideoStream(remoteVideoStream)
        })
        // Unsubscribe from remote participant's video streams that were removed.
        e.removed.forEach((remoteVideoStream) => {
          console.log("Remote participant video stream was removed.")
        })
      })
    } catch (error) {
      console.error(error)
    }
  }

  const subscribeToRemoteVideoStream = async (remoteVideoStream) => {
    let renderer = new VideoStreamRenderer(remoteVideoStream)
    let view
    let remoteVideoContainer = document.createElement("div")
    remoteVideoContainer.className = "remote-video-container"

    let loadingSpinner = document.createElement("div")
    loadingSpinner.className = "loading-spinner"
    remoteVideoStream.on("isReceivingChanged", () => {
      try {
        if (remoteVideoStream.isAvailable) {
          const isReceiving = remoteVideoStream.isReceiving
          const isLoadingSpinnerActive = remoteVideoContainer.contains(loadingSpinner)
          if (!isReceiving && !isLoadingSpinnerActive) {
            remoteVideoContainer.appendChild(loadingSpinner)
          } else if (isReceiving && isLoadingSpinnerActive) {
            remoteVideoContainer.removeChild(loadingSpinner)
          }
        }
      } catch (e) {
        console.error(e)
      }
    })

    const createView = async () => {
      // Create a renderer view for the remote video stream.
      view = await renderer.createView()
      // Attach the renderer view to the UI.
      remoteVideoContainer.appendChild(view.target)
      remoteVideosGalleryRef.current.appendChild(remoteVideoContainer)
    }

    // Remote participant has switched video on/off
    remoteVideoStream.on("isAvailableChanged", async () => {
      try {
        if (remoteVideoStream.isAvailable) {
          await createView()
        } else {
          view.dispose()
          remoteVideosGalleryRef.current.removeChild(remoteVideoContainer)
        }
      } catch (e) {
        console.error(e)
      }
    })

    // Remote participant has video on initially.
    if (remoteVideoStream.isAvailable) {
      try {
        await createView()
      } catch (e) {
        console.error(e)
      }
    }
  }

  // Function to start the local video stream
  const startVideo = async () => {
    try {
      // Check if there's a valid ongoing call
      if (call) {
        // Create a new local video stream
        const newLocalVideoStream = await createLocalVideoStream()

        // Start the video stream in the current call
        await call.startVideo(newLocalVideoStream)

        // Update the state to reflect the local video stream
        setLocalVideoStreamState(newLocalVideoStream)

        // Enable/disable buttons as needed
        startVideoButtonRef.current.disabled = true
        stopVideoButtonRef.current.disabled = false
      } else {
        console.warn("Cannot start video: No ongoing call.")
      }
    } catch (error) {
      console.error("Error starting local video stream:", error)
    }
  }

  // Function to stop the local video stream
  const stopVideo = async () => {
    try {
      // Check if there's a valid ongoing call and local video stream
      if (call && localVideoStreamState) {
        // Stop the local video stream in the current call
        await call.stopVideo(localVideoStreamState)

        // Clean up the local video stream
        await removeLocalVideoStream()

        // Update the state to reflect the end of the local video stream
        setLocalVideoStreamState(null)

        // Enable/disable buttons as needed
        startVideoButtonRef.current.disabled = false
        stopVideoButtonRef.current.disabled = true
      } else {
        console.warn("Cannot stop video: No ongoing call or local video stream.")
      }
    } catch (error) {
      console.error("Error stopping local video stream:", error)
    }
  }

  // Function to create a local video stream
  const createLocalVideoStream = async () => {
    try {
      const camera = (await deviceManager.getCameras())[0]
      if (camera) {
        console.log("Camera found:", camera)
        const newLocalVideoStream = new LocalVideoStream(camera)
        console.log("Local video stream created:", newLocalVideoStream)
        return newLocalVideoStream
      } else {
        console.error("No camera device found on the system")
        return null
      }
    } catch (error) {
      console.error("Error creating local video stream:", error)
      return null
    }
  }

  const displayLocalVideoStream = async () => {
    try {
      console.log("Dispplaying Local Video Stream: ", localVideoStreamState)
      if (localVideoStreamState) {
        const renderer = new VideoStreamRenderer(localVideoStreamState)
        const view = await renderer.createView()
        const localVideoContainer = localVideoContainerRef.current
        localVideoContainer.appendChild(view.target)
        localVideoContainer.hidden = false
      }
    } catch (error) {
      console.error("Error displaying local video stream:", error)
    }
  }

  const removeLocalVideoStream = async () => {
    try {
      if (localVideoStreamState) {
        // Dispose of local video stream renderer
        localVideoStreamState.dispose()

        // Clear the local video container using React ref
        const localVideoContainer = localVideoContainerRef.current
        console.log(localVideoContainer)
        while (localVideoContainer.firstChild) {
          localVideoContainer.removeChild(localVideoContainer.firstChild)
        }

        // Hide the local video container using React state
        setLocalVideoStreamState(null)
        localVideoContainerRef.current.hidden = true
      }
    } catch (error) {
      console.error("Error removing local video stream:", error)
    }
  }

  const cleanUpBeforeStartCall = async () => {
    try {
      //Check if there's an existing call and hang up if needed
      if (call) {
        await hangUpCall()
      }

      // Dispose of local video stream renderer and remove UI elements
      await removeLocalVideoStream()

      // Reset relevant state variables
      setCall(null)
      setLocalVideoStreamState(null)
      // Reset other state variables as needed

      // Additional cleanup steps if required
    } catch (error) {
      console.error("Error during cleanup:", error)
    }
  }

  const handleStartCall = async () => {
    await cleanUpBeforeStartCall()
    startCall()
  }

  // Function to hang up the ongoing call
  const hangUpCall = async () => {
    try {
      // Check if there's a valid ongoing call
      if (call && call.state !== "Disconnected") {
        // End the current call
        await call.hangUp()

        // Clean up the local video stream
        if (localVideoStreamState) {
          await removeLocalVideoStream()
          setLocalVideoStreamState(null)
        }

        // Clean up the incoming call state
        setIncomingCall(null)

        // Update the state to reflect the end of the call
        setCall(null)

        // Enable/disable buttons as needed
        initializeCallAgentButtonRef.current.disabled = false
        startCallButtonRef.current.disabled = false
        hangUpCallButtonRef.current.disabled = true
        startVideoButtonRef.current.disabled = true
        stopVideoButtonRef.current.disabled = true
        connectedLabelRef.current.hidden = true
        remoteVideosGalleryRef.current.hidden = true
        localVideoContainerRef.current.hidden = true

        console.log("Call ended successfully.")
      } else {
        console.warn("Cannot hang up: No ongoing call or invalid state.")
      }
    } catch (error) {
      console.error("Error hanging up the call:", error)
    }
  }

  return (
    <div>
      <h4>Azure Communication Services - Calling Web SDK</h4>
      <input
        type="text"
        placeholder="User access token"
        value={userAccessToken}
        onChange={(e) => setUserAccessToken(e.target.value)}
        style={{ marginBottom: "1em", width: "500px" }}
      />
      <button
        onClick={initializeCallAgent}
        ref={initializeCallAgentButtonRef}
      >
        Initialize Call Agent
      </button>
      <br />
      <br />
      <input
        type="text"
        placeholder="Enter callee's ACS user identity"
        value={calleeAcsUserId}
        onChange={(e) => setCalleeAcsUserId(e.target.value)}
        style={{ marginBottom: "1em", width: "500px", display: "block" }}
      />
      <button
        onClick={handleStartCall}
        ref={startCallButtonRef}
        disabled={false}
      >
        Start Call
      </button>
      <button
        onClick={hangUpCall}
        ref={hangUpCallButtonRef}
        disabled={false}
      >
        Hang Up Call
      </button>
      <button
        onClick={startVideo}
        ref={startVideoButtonRef}
        disabled={false}
      >
        Start Video
      </button>
      <button
        onClick={stopVideo}
        ref={stopVideoButtonRef}
        disabled={false}
      >
        Stop Video
      </button>
      <button
        onClick={acceptIncomingCall}
        ref={acceptCallButtonRef}
        disabled={false}
      >
        Accept Call
      </button>
      <div
        id="connectedLabel"
        ref={connectedLabelRef}
        style={{ color: "#13bb13" }}
        hidden
      >
        Call is connected!
      </div>
      <br />
      <div
        id="remoteVideosGallery"
        ref={remoteVideosGalleryRef}
        style={{ width: "40%" }}
        hidden
      >
        Remote participants' video streams:
      </div>
      <br />
      {localVideoStreamState && (
        <div
          id="localVideoContainer"
          ref={localVideoContainerRef}
          style={{ width: "30%" }}
          hidden
        >
          Local video stream:
        </div>
      )}
    </div>
  )
}

export default App
