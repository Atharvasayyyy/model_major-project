import { useState, useEffect } from "react";
import { useChildren, Child } from "../context/ChildrenContext";
import { X, Loader2, CheckCircle } from "lucide-react";

interface CalibrationDialogProps {
  child: Child;
  onClose: () => void;
}

export const CalibrationDialog = ({ child, onClose }: CalibrationDialogProps) => {
  const { updateChild } = useChildren();
  const [progress, setProgress] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [calibrationData, setCalibrationData] = useState({
    hr: 0,
    hrv: 0,
  });

  const startCalibration = () => {
    setIsCalibrating(true);
    setProgress(0);

    // Simulate calibration process
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          // Generate calibration results
          const hrBaseline = Math.floor(70 + Math.random() * 20);
          const hrvBaseline = Math.floor(40 + Math.random() * 20);
          
          setCalibrationData({
            hr: hrBaseline,
            hrv: hrvBaseline,
          });
          
          setIsComplete(true);
          return 100;
        }
        return prev + 2; // 50 seconds total (100 / 2)
      });
    }, 1000);
  };

  const handleComplete = async () => {
    await updateChild(child.id, {
      hr_baseline: calibrationData.hr,
      rmssd_baseline: calibrationData.hrv,
      isCalibrated: true,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Baseline Calibration</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            disabled={isCalibrating && !isComplete}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {!isCalibrating && !isComplete && (
          <div className="space-y-4">
            <div className="bg-purple-500/10 border border-purple-500 rounded-lg p-4">
              <p className="text-sm text-purple-200">
                <strong>Instructions:</strong>
              </p>
              <p className="text-sm text-purple-200 mt-2">
                Please ensure {child.child_name} is sitting calmly and relaxed. The device
                will record baseline data for approximately 5 minutes.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                During calibration, the system will collect:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Heart Rate baseline</li>
                <li>HRV (RMSSD) baseline</li>
                <li>Motion level baseline</li>
              </ul>
            </div>

            <button
              onClick={startCalibration}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg transition-colors"
            >
              Start Calibration
            </button>
          </div>
        )}

        {isCalibrating && !isComplete && (
          <div className="space-y-6">
            <div className="flex flex-col items-center">
              <Loader2 className="w-16 h-16 text-purple-500 animate-spin mb-4" />
              <p className="text-lg font-semibold mb-2">Calibrating...</p>
              <p className="text-sm text-muted-foreground text-center">
                Please remain calm and still during the calibration process
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Progress</span>
                <span className="text-sm font-semibold">{progress}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <div
                  className="bg-purple-600 h-full transition-all duration-1000"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {isComplete && (
          <div className="space-y-6">
            <div className="flex flex-col items-center">
              <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
              <p className="text-lg font-semibold mb-2">Calibration Complete!</p>
            </div>

            <div className="bg-secondary rounded-lg p-4 space-y-3">
              <h3 className="font-semibold mb-2">Baseline Results</h3>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Heart Rate:</span>
                <span className="font-semibold">{calibrationData.hr} bpm</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">HRV (RMSSD):</span>
                <span className="font-semibold">{calibrationData.hrv} ms</span>
              </div>
            </div>

            <button
              onClick={handleComplete}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg transition-colors"
            >
              Save & Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
