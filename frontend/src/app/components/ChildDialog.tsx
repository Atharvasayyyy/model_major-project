import { useState, useEffect } from "react";
import { useChildren, Child } from "../context/ChildrenContext";
import { X } from "lucide-react";

interface ChildDialogProps {
  child: Child | null;
  onClose: () => void;
}

export const ChildDialog = ({ child, onClose }: ChildDialogProps) => {
  const { addChild, updateChild } = useChildren();
  const [submitError, setSubmitError] = useState("");
  const [formData, setFormData] = useState({
    child_name: "",
    age: "",
    grade: "",
    device_id: `esp32-${Date.now()}`,
    hr_baseline: "78",
    rmssd_baseline: "52",
  });

  useEffect(() => {
    if (child) {
      setFormData({
        child_name: child.child_name,
        age: child.age.toString(),
        grade: child.grade,
        device_id: child.device_id,
        hr_baseline: child.hr_baseline.toString(),
        rmssd_baseline: child.rmssd_baseline.toString(),
      });
    }
  }, [child]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    
    const data = {
      child_name: formData.child_name,
      age: parseInt(formData.age),
      grade: formData.grade,
      device_id: formData.device_id,
      hr_baseline: parseInt(formData.hr_baseline),
      rmssd_baseline: parseInt(formData.rmssd_baseline),
    };

    try {
      if (child) {
        await updateChild(child.id, data);
      } else {
        await addChild(data);
      }
      onClose();
    } catch (e: any) {
      setSubmitError(e?.response?.data?.message || "Failed to save child profile. Please verify device id and try again.");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
      <div className="bg-card border border-border rounded-lg p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">
            {child ? "Edit Child Profile" : "Add Child Profile"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {submitError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {submitError}
            </div>
          )}

          <div>
            <label className="block text-sm mb-2">Child Name</label>
            <input
              type="text"
              value={formData.child_name}
              onChange={(e) =>
                setFormData({ ...formData, child_name: e.target.value })
              }
              required
              className="w-full bg-secondary text-foreground rounded-lg px-4 py-2 border border-border focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2">Age</label>
              <input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                required
                min="1"
                max="18"
                className="w-full bg-secondary text-foreground rounded-lg px-4 py-2 border border-border focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm mb-2">Grade</label>
              <input
                type="text"
                value={formData.grade}
                onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                required
                className="w-full bg-secondary text-foreground rounded-lg px-4 py-2 border border-border focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2">Device ID</label>
            <input
              type="text"
              value={formData.device_id}
              onChange={(e) =>
                setFormData({ ...formData, device_id: e.target.value })
              }
              required
              placeholder="e.g., MP-001"
              className="w-full bg-secondary text-foreground rounded-lg px-4 py-2 border border-border focus:border-purple-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-2">HR Baseline (bpm)</label>
              <input
                type="number"
                value={formData.hr_baseline}
                onChange={(e) =>
                  setFormData({ ...formData, hr_baseline: e.target.value })
                }
                required
                className="w-full bg-secondary text-foreground rounded-lg px-4 py-2 border border-border focus:border-purple-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm mb-2">HRV Baseline (ms)</label>
              <input
                type="number"
                value={formData.rmssd_baseline}
                onChange={(e) =>
                  setFormData({ ...formData, rmssd_baseline: e.target.value })
                }
                required
                className="w-full bg-secondary text-foreground rounded-lg px-4 py-2 border border-border focus:border-purple-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-secondary hover:bg-accent text-foreground px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {child ? "Update" : "Add"} Child
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
