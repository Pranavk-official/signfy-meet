import React, {
  createContext,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CreateLocalMediaOptions,
  getUserMedia,
  LocalTrack,
  TrackSource,
} from "@mux/spaces-web";
import * as tf from "@tensorflow/tfjs";

import UserContext from "./User";

import { defaultAudioConstraints } from "shared/defaults";

interface UserMediaState {
  activeCamera?: LocalTrack;
  activeMicrophone?: LocalTrack;
  userMediaError?: string;
  requestPermissionAndPopulateDevices: () => void;
  requestPermissionAndStartDevices: (
    microphoneDeviceId?: string,
    cameraDeviceId?: string
  ) => Promise<void>;
  getCamera: (deviceId: string) => Promise<LocalTrack>;
  cameraDevices: MediaDeviceInfo[];
  activeCameraId?: string;
  stopActiveCamera: () => void;
  changeActiveCamera: (deviceId: string) => Promise<void>;
  getMicrophone: (deviceId: string) => Promise<LocalTrack>;
  microphoneDevices: MediaDeviceInfo[];
  activeMicrophoneId?: string;
  muteActiveMicrophone: () => void;
  unMuteActiveMicrophone: () => void;
  changeActiveMicrophone: (deviceId: string) => Promise<void>;
  getActiveMicrophoneLevel: () => {
    avgDb: number;
    peakDb: number;
  } | null;
}

export const UserMediaContext = createContext({} as UserMediaState);

export default UserMediaContext;

const defaultCameraOption: CreateLocalMediaOptions = {
  video: {},
};

const defaultMicrophoneOption: CreateLocalMediaOptions = {
  audio: { constraints: defaultAudioConstraints },
};

const noCameraOption: CreateLocalMediaOptions = {
  video: false,
};

const noMicrophoneOption: CreateLocalMediaOptions = {
  audio: false,
};

const defaultMicrophoneCameraOptions: CreateLocalMediaOptions = {
  ...defaultCameraOption,
  ...defaultMicrophoneOption,
};

const teachableMachineURL = "https://teachablemachine.withgoogle.com/models/cqbb-nRkh/";
const teachableMachineModelURL = teachableMachineURL + "model.json";
const teachableMachineMetadataURL = teachableMachineURL + "metadata.json";

type Props = {
  children: ReactNode;
};

export const UserMediaProvider: React.FC<Props> = ({ children }) => {
  const {
    cameraDeviceId,
    setCameraDeviceId,
    microphoneDeviceId,
    setMicrophoneDeviceId,
    userWantsMicMuted,
  } = React.useContext(UserContext);
  const [microphoneDevices, setMicrophoneDevices] = useState<InputDeviceInfo[]>(
    []
  );
  const [activeMicrophone, setActiveMicrophone] = useState<LocalTrack>();
  const [cameraDevices, setCameraDevices] = useState<InputDeviceInfo[]>([]);
  const [activeCamera, setActiveCamera] = useState<LocalTrack>();
  const [localAudioAnalyser, setLocalAudioAnalyser] = useState<AnalyserNode>();
  const [userMediaError, setUserMediaError] = useState<string>();

  const activeCameraId = useMemo(() => {
    return activeCamera?.deviceId;
  }, [activeCamera]);

  const activeMicrophoneId = useMemo(() => {
    return activeMicrophone?.deviceId;
  }, [activeMicrophone]);

  const setupLocalMicrophoneAnalyser = useCallback((track: LocalTrack) => {
    let stream = new MediaStream([track.track]);

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);

    setLocalAudioAnalyser(analyser);
  }, []);

  const requestPermissionAndPopulateDevices = useCallback(() => {
    navigator.mediaDevices
      .getUserMedia(defaultMicrophoneCameraOptions)
      .then((stream) => {
        return stream.getTracks().forEach((track) => {
          track.stop();
        });
      })
      .then(() => {
        return navigator.mediaDevices.enumerateDevices();
      })
      .then((devices) => {
        const audioDevices = devices.filter(
          (device) => device.kind === "audioinput"
        );
        setMicrophoneDevices(audioDevices);
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );
        setCameraDevices(videoDevices);
      })
      .catch((error) => {
        setUserMediaError(
          "Error accessing user media devices. Please ensure that you have a working microphone and camera."
        );
      });
  }, []);

  const requestPermissionAndStartDevices = useCallback(
    async (microphoneDeviceId?: string, cameraDeviceId?: string) => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error(
            "getUserMedia is not supported in this browser. Please use a modern browser that supports this feature."
          );
        }

        let constraints: MediaStreamConstraints = defaultMicrophoneCameraOptions;

        if (microphoneDeviceId) {
          constraints.audio = { deviceId: microphoneDeviceId };
        }

        if (cameraDeviceId) {
          constraints.video = { deviceId: cameraDeviceId };
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        stream.getTracks().forEach((track) => {
          if (track.kind === "audio") {
            const newMicrophone = new LocalTrack(track, "audio", "input");
            setActiveMicrophone(newMicrophone);
            setupLocalMicrophoneAnalyser(newMicrophone);
          }
          if (track.kind === "video") {
            setActiveCamera(new LocalTrack(track, "video", "input"));
          }
        });
      } catch (error) {
        console.error("Error starting user media devices:", error);
        setUserMediaError(
          "Error accessing user media devices. Please ensure that you have a working microphone and camera."
        );
      }
    },
    [setupLocalMicrophoneAnalyser]
  );

  const getCamera = useCallback(
    async (deviceId: string) => {
      const constraints: CreateLocalMediaOptions = {
        ...noMicrophoneOption,
        video: { deviceId },
      };

      const stream = await getUserMedia(constraints);

      const track = stream.getVideoTracks()[0];
      const camera = new LocalTrack(track, "video", "input");
      setActiveCamera(camera);
      setCameraDeviceId(deviceId);

      return camera;
    },
    [setCameraDeviceId]
  );

  const stopActiveCamera = useCallback(() => {
    if (activeCamera) {
      activeCamera.stop();
      setActiveCamera(undefined);
    }
  }, [activeCamera]);

  const changeActiveCamera = useCallback(
    async (deviceId: string) => {
      stopActiveCamera();
      return await getCamera(deviceId);
    },
    [getCamera, stopActiveCamera]
  );

  const getMicrophone = useCallback(
    async (deviceId: string) => {
      const constraints: CreateLocalMediaOptions = {
        ...noCameraOption,
        audio: { deviceId, constraints: defaultAudioConstraints },
      };

      const stream = await getUserMedia(constraints);

      const track = stream.getAudioTracks()[0];
      const microphone = new LocalTrack(track, "audio", "input");
      setActiveMicrophone(microphone);
      setupLocalMicrophoneAnalyser(microphone);
      setMicrophoneDeviceId(deviceId);

      return microphone;
    },
    [setMicrophoneDeviceId, setupLocalMicrophoneAnalyser]
  );

  const muteActiveMicrophone = useCallback(() => {
    if (activeMicrophone) {
      activeMicrophone.track.enabled = false;
    }
  }, [activeMicrophone]);

  const unMuteActiveMicrophone = useCallback(() => {
    if (activeMicrophone) {
      activeMicrophone.track.enabled = true;
    }
  }, [activeMicrophone]);

  const changeActiveMicrophone = useCallback(
    async (deviceId: string) => {
      if (activeMicrophone) {
        activeMicrophone.stop();
      }
      return await getMicrophone(deviceId);
    },
    [activeMicrophone, getMicrophone]
  );

  const getActiveMicrophoneLevel = useCallback(() => {
    if (!activeMicrophone || !localAudioAnalyser) {
      return null;
    }

    const dataArray = new Uint8Array(localAudioAnalyser.frequencyBinCount);
    localAudioAnalyser.getByteFrequencyData(dataArray);

    const values = Object.values(dataArray);
    const avgDb = values.reduce((a, b) => a + b, 0) / values.length;
    const peakDb = Math.max(...values);

    return {
      avgDb,
      peakDb,
    };
  }, [activeMicrophone, localAudioAnalyser]);

  useEffect(() => {
    tf.loadLayersModel(teachableMachineModelURL)
      .then((model) => {
        return fetch(teachableMachineMetadataURL).then((response) =>
          response.json().then((metadata) => {
            return { model, metadata };
          })
        );
      })
      .then(({ model, metadata }) => {
        // Use the model and metadata
        console.log("Teachable Machine model loaded:", model);
        console.log("Teachable Machine metadata loaded:", metadata);
      })
      .catch((error) => {
        console.error("Error loading Teachable Machine model:", error);
      });
  }, []);

  const value = {
    activeCamera,
    activeMicrophone,
    userMediaError,
    requestPermissionAndPopulateDevices,
    requestPermissionAndStartDevices,
    getCamera,
    cameraDevices,
    activeCameraId,
    stopActiveCamera,
    changeActiveCamera,
    getMicrophone,
    microphoneDevices,
    activeMicrophoneId,
    muteActiveMicrophone,
    unMuteActiveMicrophone,
    changeActiveMicrophone,
    getActiveMicrophoneLevel,
  };

  return (
    <UserMediaContext.Provider value={value}>
      {children}
    </UserMediaContext.Provider>
  );
};
