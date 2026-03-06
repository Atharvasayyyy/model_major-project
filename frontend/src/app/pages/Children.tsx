import { useState } from "react";
import { useChildren, Child } from "../context/ChildrenContext";
import { Plus, Edit, Trash2, User } from "lucide-react";
import { ChildDialog } from "../components/ChildDialog";
import { CalibrationDialog } from "../components/CalibrationDialog";

export const Children = () => {
  const { children, deleteChild, selectedChild, setSelectedChild } = useChildren();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [calibratingChild, setCalibratingChild] = useState<Child | null>(null);

  const handleEdit = (child: Child) => {
    setEditingChild(child);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this child profile?")) {
      await deleteChild(id);
    }
  };

  const handleCalibrate = (child: Child) => {
    setCalibratingChild(child);
    setCalibrationOpen(true);
  };

  const handleAddNew = () => {
    setEditingChild(null);
    setDialogOpen(true);
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Child Profiles</h1>
          <p className="text-muted-foreground">
            Manage child profiles and device settings
          </p>
        </div>
        <button
          onClick={handleAddNew}
          className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Child
        </button>
      </div>

      {/* Children Grid */}
      {children.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <User className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <p className="text-xl text-muted-foreground mb-4">No child profiles yet</p>
          <button
            onClick={handleAddNew}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Child
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {children.map((child) => (
            <div
              key={child.id}
              className={`bg-card border rounded-lg p-6 transition-all ${
                selectedChild?.id === child.id
                  ? "border-purple-500 shadow-lg shadow-purple-500/20"
                  : "border-border hover:border-purple-500/50"
              }`}
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-white text-2xl font-bold">
                  {child.child_name.charAt(0)}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-1">{child.child_name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {child.age} years • {child.grade}
                  </p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Device ID:</span>
                  <span className="font-mono font-semibold">{child.device_id}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">HR Baseline:</span>
                  <span>{child.hr_baseline} bpm</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">HRV Baseline:</span>
                  <span>{child.rmssd_baseline} ms</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Status:</span>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      child.isCalibrated
                        ? "bg-green-500/20 text-green-400"
                        : "bg-orange-500/20 text-orange-400"
                    }`}
                  >
                    {child.isCalibrated ? "Calibrated" : "Needs Calibration"}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {!child.isCalibrated && (
                  <button
                    onClick={() => handleCalibrate(child)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Calibrate
                  </button>
                )}
                {child.isCalibrated && selectedChild?.id !== child.id && (
                  <button
                    onClick={() => setSelectedChild(child)}
                    className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    Select
                  </button>
                )}
                {selectedChild?.id === child.id && (
                  <div className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm text-center">
                    Active
                  </div>
                )}
                <button
                  onClick={() => handleEdit(child)}
                  className="bg-secondary hover:bg-accent text-foreground px-3 py-2 rounded-lg transition-colors"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(child.id)}
                  className="bg-red-500/10 hover:bg-red-500/20 text-red-500 px-3 py-2 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      {dialogOpen && (
        <ChildDialog
          child={editingChild}
          onClose={() => {
            setDialogOpen(false);
            setEditingChild(null);
          }}
        />
      )}

      {/* Calibration Dialog */}
      {calibrationOpen && calibratingChild && (
        <CalibrationDialog
          child={calibratingChild}
          onClose={() => {
            setCalibrationOpen(false);
            setCalibratingChild(null);
          }}
        />
      )}
    </div>
  );
};
