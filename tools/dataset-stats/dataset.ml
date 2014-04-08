open Core.Std

type ds_arr = (float, Bigarray.float64_elt, Bigarray.c_layout) Bigarray.Genarray.t

type t = Time.t * ds_arr

(* XXX this needs the system clock to be UTC *)
(* XXX location hardcoded *)
let filename dstime = Time.format dstime "/var/www/predict/tawhiri/datasets/%Y%m%d%H"
let shape = (65, 47, 3, 361, 720)
let shape_arr = let a, b, c, d, e = shape in [|a;b;c;d;e|]

let create dstime =
    let module BA = Bigarray in
    let arr = Unix.with_file (filename dstime) ~mode:[O_RDONLY] ~f:(fun fd ->
        BA.Genarray.map_file fd BA.float64 BA.c_layout false shape_arr
    ) in
    (dstime, arr)

let get (_, arr) = Bigarray.Genarray.get arr
let dstime = fst

let iter ~f ds =
    let a, b, c, d, e = shape in
    for i = 0 to a - 1 do
        for j = 0 to b - 1 do
            for k = 0 to c - 1 do
                for l = 0 to d - 1 do
                    for m = 0 to e - 1 do
                        f i j k l m (get ds [|i;j;k;l;m|])
                    done
                done
            done
        done
    done

let find_recent () =
    let n = Time.now () in
    let i = Time.Span.scale Time.Span.hour 6. in
    (* XXX this needs the system clock to be UTC *)
    let start = Time.next_multiple ~base:Time.epoch ~after:n ~interval:i () in
    let try_open x = Option.try_with (fun () -> create x) in
    List.range ~stride:6 0 23
    |> List.map ~f:(fun i -> Float.of_int i
                             |> Time.Span.scale Time.Span.hour
                             |> Time.sub start)
    |> List.find_map ~f:try_open
    (* there must be a nicer way to erase the remaining optional args... *)
    |> (fun x -> Option.value_exn ~message:"Couldn't find any recent dataset" x)
